"""Mock telemetry WebSocket server for frontend development.

Streams JSON telemetry built from the Packet dataclass. Does not touch the
serial / parser / checksum path.

Run from repo root:
    uvicorn ground_station_software.src.testing.mock_ws_server:app --reload --port 8000
"""

import asyncio
import contextlib
import dataclasses
import logging
import random
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from ground_station_software.src.constants import Packet

logger = logging.getLogger("uvicorn.error")

SEND_HZ = 10.0  # [confirm packet rate with firmware]
DROP_PROB = 0.0  # chance a generated packet is dropped before broadcast; seq still advances
QUEUE_MAXSIZE = 64  # per-client buffer; when full, the oldest message is dropped

# Dev-only signal shapes, applied to every walked field regardless of name.
# [confirm ranges with firmware]
WALK_MIN = 0.0
WALK_MAX = 100.0
WALK_STEP = 1.0

PACKET_FIELDS = dataclasses.fields(Packet)
_FIELD_NAMES = {f.name for f in PACKET_FIELDS}

TIME_FIELD = "utc_time"  # filled with wall-clock time (display only)
ID_FIELD = "packet_id"  # 2-byte unsigned counter in the real packet
assert TIME_FIELD in _FIELD_NAMES, f"Packet has no {TIME_FIELD!r} field"
assert ID_FIELD in _FIELD_NAMES, f"Packet has no {ID_FIELD!r} field"


class BoundedWalk:
    """Gaussian random walk that reflects off [lo, hi]."""

    def __init__(self, lo: float, hi: float, step: float, as_int: bool = False):
        self.lo = lo
        self.hi = hi
        self.step_size = step
        self.as_int = as_int
        self.value = random.uniform(lo, hi)

    def step(self) -> float | int:
        v = self.value + random.gauss(0.0, self.step_size)
        if v > self.hi:
            v = 2 * self.hi - v
        if v < self.lo:
            v = 2 * self.lo - v
        self.value = min(max(v, self.lo), self.hi)
        if self.as_int:
            return max(0, int(round(self.value)))
        return self.value


def make_walks() -> dict[str, BoundedWalk]:
    return {
        f.name: BoundedWalk(WALK_MIN, WALK_MAX, WALK_STEP, as_int=f.type is int)
        for f in PACKET_FIELDS
        if f.name not in (TIME_FIELD, ID_FIELD)
    }


def build_message(seq: int, t_ms: int, walks: dict[str, BoundedWalk]) -> dict:
    data = {}
    for f in PACKET_FIELDS:
        if f.name == ID_FIELD:
            data[f.name] = seq & 0xFFFF
        elif f.name == TIME_FIELD:
            # Display only; ordering must use seq / t_ms.
            # [confirm utc_time encoding with firmware]
            data[f.name] = time.time()
        else:
            data[f.name] = walks[f.name].step()
    return {
        "type": "telemetry",  # PROVISIONAL: pending backend contract
        "seq": seq,  # PROVISIONAL: pending backend contract
        "t_ms": t_ms,  # PROVISIONAL: pending backend contract
        "data": data,
    }


def broadcast(clients: set[asyncio.Queue], msg: dict) -> None:
    for q in list(clients):
        if q.full():
            q.get_nowait()  # drop this client's oldest message
        q.put_nowait(msg)


async def producer(clients: set[asyncio.Queue]) -> None:
    """Single shared generator: owns seq, walks and t0 for the whole server."""
    seq = 0
    walks = make_walks()
    t0 = time.monotonic()
    deadline = t0
    while True:
        t_ms = int((time.monotonic() - t0) * 1000)
        msg = build_message(seq, t_ms, walks)
        if random.random() >= DROP_PROB:
            broadcast(clients, msg)
        seq += 1

        period = 1.0 / SEND_HZ
        deadline += period
        now = time.monotonic()
        if now - deadline > period:
            # More than one tick behind: resync instead of bursting to catch up.
            deadline = now
        await asyncio.sleep(max(0.0, deadline - now))


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.clients = set()
    task = asyncio.create_task(producer(app.state.clients))
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


app = FastAPI(lifespan=lifespan)


@app.websocket("/ws")
async def telemetry_ws(ws: WebSocket) -> None:
    await ws.accept()
    clients: set[asyncio.Queue] = ws.app.state.clients
    q: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_MAXSIZE)
    clients.add(q)
    sent = 0
    try:
        while True:
            await ws.send_json(await q.get())
            sent += 1
    except WebSocketDisconnect:
        logger.info("mock_ws_server: client disconnected after %d messages", sent)
    finally:
        clients.discard(q)

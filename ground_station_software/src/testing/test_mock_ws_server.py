import dataclasses
import random

from fastapi.testclient import TestClient

from ground_station_software.src.constants import Packet
from ground_station_software.src.testing import mock_ws_server
from ground_station_software.src.testing.mock_ws_server import app

ENVELOPE_KEYS = {"type", "seq", "t_ms", "data"}
PACKET_KEYS = {f.name for f in dataclasses.fields(Packet)}


def receive(n: int) -> list[dict]:
    with TestClient(app) as client, client.websocket_connect("/ws") as ws:
        return [ws.receive_json() for _ in range(n)]


def test_envelope_and_fields(monkeypatch):
    monkeypatch.setattr(mock_ws_server, "DROP_PROB", 0.0)
    monkeypatch.setattr(mock_ws_server, "SEND_HZ", 100.0)

    msgs = receive(3)

    for msg in msgs:
        assert set(msg) == ENVELOPE_KEYS
        assert msg["type"] == "telemetry"
        assert set(msg["data"]) == PACKET_KEYS
    seqs = [m["seq"] for m in msgs]
    assert all(b > a for a, b in zip(seqs, seqs[1:]))


def test_drop_creates_seq_gaps(monkeypatch):
    random.seed(1234)
    monkeypatch.setattr(mock_ws_server, "DROP_PROB", 0.5)
    monkeypatch.setattr(mock_ws_server, "SEND_HZ", 100.0)

    seqs = [m["seq"] for m in receive(20)]

    assert all(b > a for a, b in zip(seqs, seqs[1:]))
    assert any(b - a > 1 for a, b in zip(seqs, seqs[1:]))

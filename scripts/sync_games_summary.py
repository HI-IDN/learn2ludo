"""
sync_games_summary.py
---------------------
Checks data/games_summary.json against the files in data/games/ and
adds any missing entries.  Safe to run at any time — existing entries
are left untouched so manually-set names are preserved.

Usage:
    python scripts/sync_games_summary.py [--rebuild]

Options:
    --rebuild   Overwrite every entry from scratch (use when metadata
                schema changes, e.g. a new field is added).
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAMES_DIR          = ROOT / "data" / "games"
SUMMARY_PATH       = ROOT / "data" / "games_summary.json"
PLAYERS_PATH       = ROOT / "data" / "players.json"


def extract_meta(filename: str, data: dict) -> dict:
    cfg   = data.get("config", {})
    board = cfg.get("board", {})
    refs  = data.get("players_registry") or data.get("player_refs") or []
    players = []
    color_by_index = {p.get("index"): p.get("color") for p in data.get("players", []) if p.get("index") is not None}
    for p in refs:
        idx = p.get("player_index")
        players.append({
            "index":         idx,
            "color":         p.get("color") or color_by_index.get(idx),
            "type":          p.get("type"),
            "human_id":      p.get("human_id") or p.get("player_uuid") or None,
            "bot_id":        p.get("bot_id") or None,
            "designer_uuid": p.get("designer_uuid") or None,
        })
    justification_count = sum(
        1 for h in data.get("history", [])
        if h.get("type") == "move" and h.get("justification")
    )
    return {
        "filename":            filename,
        "name":                data.get("_name") or None,
        "incomplete":          bool(data.get("_incomplete")),
        "started_at_ms":       data.get("started_at_ms"),
        "finished_at_ms":      data.get("finished_at_ms"),
        "player_count":        data.get("num_players") or cfg.get("player_count"),
        "yard_count":          board.get("yard_count"),
        "winner":              data.get("winner"),
        "players":             players,
        "justification_count": justification_count,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--rebuild", action="store_true", help="Overwrite all entries from scratch")
    args = parser.parse_args()

    if not GAMES_DIR.exists():
        print("No data/games/ directory found — nothing to do.")
        sys.exit(0)

    summary: dict = {}
    if not args.rebuild and SUMMARY_PATH.exists():
        try:
            summary = json.loads(SUMMARY_PATH.read_text())
            print(f"Loaded existing summary: {len(summary)} entries")
        except Exception as e:
            print(f"Warning: could not read existing summary ({e}), starting fresh")

    all_files = list(GAMES_DIR.glob("*.json"))
    print(f"Found {len(all_files)} game files")

    added = updated = skipped = errors = 0
    for f in all_files:
        already_present = f.name in summary
        if already_present and not args.rebuild:
            skipped += 1
            continue
        try:
            data = json.loads(f.read_text())
            meta = extract_meta(f.name, data)
            if already_present:
                # Preserve manually-set name if the file doesn't have one
                if not meta["name"] and summary[f.name].get("name"):
                    meta["name"] = summary[f.name]["name"]
                updated += 1
            else:
                added += 1
            summary[f.name] = meta
        except Exception as e:
            print(f"  ERROR {f.name}: {e}")
            errors += 1

    # Remove summary entries whose files no longer exist
    missing = [k for k in list(summary.keys()) if not (GAMES_DIR / k).exists()]
    for k in missing:
        del summary[k]
    if missing:
        print(f"Removed {len(missing)} stale entries: {missing}")

    SUMMARY_PATH.parent.mkdir(parents=True, exist_ok=True)
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2))

    if args.rebuild:
        print(f"Rebuilt summary: {len(summary)} entries ({errors} errors)")
    else:
        print(f"Done — added {added}, skipped {skipped}, errors {errors}")
        if missing:
            print(f"Pruned {len(missing)} stale entries")


if __name__ == "__main__":
    main()

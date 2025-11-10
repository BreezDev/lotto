from flask import Flask, render_template, jsonify, request, redirect, url_for, session
import sqlite3, os, random, json, datetime, secrets

from typing import Dict, Any

app = Flask(__name__)
app.secret_key = "lotto-life-secret"
app.permanent_session_lifetime = datetime.timedelta(days=14)

DB_PATH = "game.db"

# --- State & Federal Tax Rates ---
STATE_TAX = {
    "MI": 0.0425, "CA": 0.133, "TX": 0.00, "FL": 0.00, "NY": 0.109,
    "IL": 0.0495, "PA": 0.0307, "OH": 0.04, "NJ": 0.1075, "GA": 0.0575
}
FEDERAL_TAX = 0.24  # average federal withholding

# --- DB Setup ---
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS players (
            id TEXT PRIMARY KEY,
            name TEXT,
            state TEXT,
            wallet REAL,
            savings REAL,
            net REAL,
            rep REAL,
            updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            goal TEXT,
            day INTEGER DEFAULT 1,
            lifestyle REAL DEFAULT 0,
            happiness REAL DEFAULT 50,
            high_net REAL DEFAULT 0,
            taxes_paid REAL DEFAULT 0,
            charity_given REAL DEFAULT 0,
            last_state TEXT
        )
        """
    )
    conn.commit()

    # make sure columns exist for users coming from an older schema
    optional_columns = {
        "goal": "TEXT",
        "day": "INTEGER DEFAULT 1",
        "lifestyle": "REAL DEFAULT 0",
        "happiness": "REAL DEFAULT 50",
        "high_net": "REAL DEFAULT 0",
        "taxes_paid": "REAL DEFAULT 0",
        "charity_given": "REAL DEFAULT 0",
        "last_state": "TEXT",
    }
    for column, ddl in optional_columns.items():
        try:
            c.execute(f"ALTER TABLE players ADD COLUMN {column} {ddl}")
            conn.commit()
        except sqlite3.OperationalError:
            # column already exists
            pass

    conn.close()
init_db()

# --- Pages ---
@app.route("/")
def home():
    # if user hasn't entered winnings yet, go to start page
    if "wallet" not in session or session.get("wallet", 0) <= 0:
        return redirect(url_for("start"))
    return redirect(url_for("game"))


@app.route("/start")
def start():
    return render_template("start.html")

@app.route("/startgame", methods=["POST"])
def startgame():
    try:
        raw_amount = request.form.get("amount", "0").replace(",", "")
        amt = max(0.0, float(raw_amount))
    except ValueError:
        amt = 0.0

    st = request.form.get("state", "MI")
    goal = request.form.get("goal", "").strip()
    profile = request.form.get("profile", "balanced")
    name = request.form.get("name", "Player").strip() or "Player"
    lifestyle = request.form.get("lifestyle", "smart")
    payout = request.form.get("payout", "lump")

    if payout == "annuity":
        # simplified annuity estimate: 30-year payout with 4% APY assumption
        years = 30
        rate = 0.04
        annuity_payment = (amt * rate) / (1 - (1 + rate) ** (-years)) if amt else 0
        amt = annuity_payment * years * 0.55  # assume taxes on each payment ~45%

    fed_tax = amt * FEDERAL_TAX
    state_tax = amt * STATE_TAX.get(st, 0)
    net = max(0.0, amt - (fed_tax + state_tax))
    savings = net * 0.20
    wallet = net - savings

    session.permanent = True
    session["player_id"] = session.get("player_id") or secrets.token_hex(8)
    session["player_name"] = name
    session["profile"] = profile
    session["lifestyle_pref"] = lifestyle
    session["payout_type"] = payout
    session["wallet"] = wallet
    session["savings"] = savings
    session["state"] = st
    session["goal"] = goal
    session["net"] = net
    session["starting_amount"] = amt
    session["tax_paid"] = fed_tax + state_tax
    session["day"] = 1
    session.modified = True
    return redirect(url_for("game"))

@app.route("/game")
def game():
    if "wallet" not in session:
        return redirect(url_for("start"))

    start_data: Dict[str, Any] = {
        "wallet": round(session.get("wallet", 0.0), 2),
        "savings": round(session.get("savings", 0.0), 2),
        "net": round(session.get("net", 0.0), 2),
        "state": session.get("state", ""),
        "goal": session.get("goal", ""),
        "playerName": session.get("player_name", "Player"),
        "playerId": session.get("player_id"),
        "profile": session.get("profile", "balanced"),
        "payout": session.get("payout_type", "lump"),
        "lifestylePref": session.get("lifestyle_pref", "smart"),
        "taxPaid": round(session.get("tax_paid", 0.0), 2),
        "startingAmount": round(session.get("starting_amount", 0.0), 2),
        "day": session.get("day", 1),
    }
    return render_template("game.html", start_data=start_data)

@app.route("/leaderboard")
def leaderboard():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM players ORDER BY net DESC LIMIT 100"
    ).fetchall()
    conn.close()
    return render_template("leaderboard.html", players=rows)

@app.route("/guide")
def guide():
    return render_template("guide.html")

# --- API: catalogs + update ---
@app.route("/api/catalog/<cat>")
def catalog(cat):
    path = f"static/json/{cat}.json"
    if not os.path.exists(path): return jsonify([])
    with open(path) as f: return jsonify(json.load(f))

@app.route("/api/update", methods=["POST"])
def api_update():
    data = request.get_json() or {}
    pid = session.get("player_id") or data.get("id") or f"user_{random.randint(1000,9999)}"
    session["player_id"] = pid
    wallet = float(data.get("wallet", 0))
    savings = float(data.get("savings", 0))
    net = float(data.get("net", wallet + savings))
    rep = float(data.get("rep", 0))
    state = session.get("state", "Unknown")
    name = data.get("name") or session.get("player_name") or f"Player {pid[-4:]}"
    goal = data.get("goal") or session.get("goal", "")
    day = int(data.get("day", session.get("day", 1)))
    lifestyle = float(data.get("lifestyle", 0))
    happiness = float(data.get("happiness", 50))
    high_net = float(data.get("high_net", net))
    taxes_paid = float(data.get("taxes_paid", session.get("tax_paid", 0)))
    charity_given = float(data.get("charity_given", 0))
    last_state = json.dumps(data.get("state", {})) if data.get("state") else None
    session["day"] = day
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        """
        INSERT INTO players (
            id, name, state, wallet, savings, net, rep, updated,
            goal, day, lifestyle, happiness, high_net, taxes_paid, charity_given, last_state
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name=excluded.name,
            state=excluded.state,
            wallet=excluded.wallet,
            savings=excluded.savings,
            net=excluded.net,
            rep=excluded.rep,
            updated=excluded.updated,
            goal=excluded.goal,
            day=excluded.day,
            lifestyle=excluded.lifestyle,
            happiness=excluded.happiness,
            high_net=excluded.high_net,
            taxes_paid=excluded.taxes_paid,
            charity_given=excluded.charity_given,
            last_state=excluded.last_state
        """,
        (
            pid,
            name,
            state,
            wallet,
            savings,
            net,
            rep,
            datetime.datetime.utcnow(),
            goal,
            day,
            lifestyle,
            happiness,
            high_net,
            taxes_paid,
            charity_given,
            last_state,
        ),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "id": pid})


@app.route("/api/session")
def api_session():
    return jsonify({k: session.get(k) for k in [
        "player_id",
        "player_name",
        "state",
        "goal",
        "wallet",
        "savings",
        "net",
        "tax_paid",
        "day",
    ]})


@app.route("/reset")
def reset():
    session.clear()
    return redirect(url_for("start"))


@app.context_processor
def inject_tax_tables():
    return {"STATE_TAX": STATE_TAX, "FEDERAL_TAX": FEDERAL_TAX}

@app.route("/debugsession")
def debugsession():
    from flask import jsonify
    return jsonify(dict(session))


if __name__ == "__main__":
    app.run(debug=True)

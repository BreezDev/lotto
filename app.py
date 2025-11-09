from flask import Flask, render_template, jsonify, request, redirect, url_for, session
import sqlite3, os, random, json, datetime

app = Flask(__name__)
app.secret_key = "lotto-life-secret"

DB_PATH = "game.db"

# --- State & Federal Tax Rates ---
STATE_TAX = {
    "MI": 0.0425, "CA": 0.133, "TX": 0.00, "FL": 0.00, "NY": 0.109,
    "IL": 0.0495, "PA": 0.0307, "OH": 0.04, "NJ": 0.1075, "GA": 0.0575
}
FEDERAL_TAX = 0.24  # average federal withholding

# --- DB Setup ---
def init_db():
    if not os.path.exists(DB_PATH):
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("""
        CREATE TABLE players (
            id TEXT PRIMARY KEY,
            name TEXT,
            state TEXT,
            wallet REAL,
            savings REAL,
            net REAL,
            rep REAL,
            updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
        conn.commit(); conn.close()
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
    amt = float(request.form.get("amount", 0))
    st = request.form.get("state", "MI")
    goal = request.form.get("goal", "")
    fed_tax = amt * FEDERAL_TAX
    state_tax = amt * STATE_TAX.get(st, 0)
    net = amt - (fed_tax + state_tax)
    savings = net * 0.10
    wallet = net - savings
    session["wallet"] = wallet
    session["savings"] = savings
    session["state"] = st
    session["goal"] = goal
    session["net"] = net
    return redirect(url_for("game"))

@app.route("/game")
def game():
    return render_template("game.html")

@app.route("/leaderboard")
def leaderboard():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM players ORDER BY net DESC LIMIT 100").fetchall()
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
    pid = data.get("id") or f"user_{random.randint(1000,9999)}"
    wallet = float(data.get("wallet", 0))
    savings = float(data.get("savings", 0))
    net = float(data.get("net", wallet + savings))
    rep = float(data.get("rep", 0))
    state = session.get("state", "Unknown")
    name = f"Player {pid[-4:]}"
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        INSERT INTO players (id, name, state, wallet, savings, net, rep, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            wallet=?, savings=?, net=?, rep=?, updated=?
    """, (pid, name, state, wallet, savings, net, rep,
          wallet, savings, net, rep, datetime.datetime.utcnow()))
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "id": pid})

@app.route("/debugsession")
def debugsession():
    from flask import jsonify
    return jsonify(dict(session))


if __name__ == "__main__":
    app.run(debug=True)

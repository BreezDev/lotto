from flask import Flask, render_template, jsonify, request, redirect, url_for, session
import sqlite3, os, random, json, datetime, secrets
from urllib import request as urlrequest
from urllib.error import URLError, HTTPError

from typing import Dict, Any

app = Flask(__name__)
app.secret_key = "lotto-life-secret"
app.permanent_session_lifetime = datetime.timedelta(days=14)

DB_PATH = "game.db"

MAX_ENTRY_AMOUNT = 1_000_000_000

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


def _format_currency(value: float) -> str:
    try:
        return f"${value:,.2f}"
    except (TypeError, ValueError):
        return "$0.00"


def send_resend_email(to_email: str, subject: str, html: str) -> bool:
    """Send an email via the Resend API. Returns True on success."""
    api_key = os.getenv("RESEND_API_KEY")
    if not api_key or not to_email:
        app.logger.info("Resend email skipped – missing api key or email")
        return False

    payload = json.dumps({
        "from": "LottoLife Simulator <lotto@resend.dev>",
        "to": [to_email],
        "subject": subject,
        "html": html,
    }).encode("utf-8")

    req = urlrequest.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urlrequest.urlopen(req, timeout=10) as resp:
            resp.read()
        return True
    except (URLError, HTTPError) as exc:
        app.logger.warning("Resend email failed: %s", exc)
        return False

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
        if amt > MAX_ENTRY_AMOUNT:
            amt = MAX_ENTRY_AMOUNT
    except ValueError:
        amt = 0.0

    st = request.form.get("state", "MI")
    goal = request.form.get("goal", "").strip()
    profile = request.form.get("profile", "balanced")
    name = request.form.get("name", "Player").strip() or "Player"
    lifestyle = request.form.get("lifestyle", "smart")
    payout = request.form.get("payout", "lump")
    email = request.form.get("email", "").strip()

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
    if email:
        session["player_email"] = email
    session.modified = True

    if email:
        summary_html = f"""
            <h2>Welcome to LottoLife, {name}!</h2>
            <p>Here is the snapshot of your jackpot after taxes:</p>
            <ul>
                <li><strong>State:</strong> {st}</li>
                <li><strong>Goal:</strong> {goal or 'Set inside the simulator'}</li>
                <li><strong>Net after tax:</strong> {_format_currency(net)}</li>
                <li><strong>Wallet:</strong> {_format_currency(wallet)}</li>
                <li><strong>Savings:</strong> {_format_currency(savings)}</li>
                <li><strong>Estimated taxes paid:</strong> {_format_currency(fed_tax + state_tax)}</li>
            </ul>
            <p>You can always export your save inside the simulator or request another copy of your stats from the Lifestyle tab.</p>
            <p style='color:#7184ff'>Need to configure email sending? Set the <code>RESEND_API_KEY</code> environment variable on your host.</p>
        """
        send_resend_email(email, f"LottoLife setup for {name}", summary_html)
    return redirect(url_for("game"))

@app.route("/game")
def game():
    if "wallet" not in session:
        return redirect(url_for("start"))

    def load_catalog_blob(cat: str):
        path = os.path.join(app.root_path, "static", "json", f"{cat}.json")
        try:
            with open(path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
            if isinstance(data, list):
                return data
        except (FileNotFoundError, json.JSONDecodeError):
            pass
        return []

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
        "playerEmail": session.get("player_email", ""),
    }
    catalogs = {cat: load_catalog_blob(cat) for cat in ("cars", "houses", "biz", "charity", "items")}
    return render_template("game.html", start_data=start_data, catalog_data=catalogs)

@app.route("/leaderboard")
def leaderboard():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM players ORDER BY net DESC LIMIT 100"
    ).fetchall()
    conn.close()
    enriched = []
    for row in rows:
        top_charity = None
        charity_count = 0
        try:
            if row["last_state"]:
                last_state = json.loads(row["last_state"])
                charities = (
                    last_state.get("holdings", {}).get("charities")
                    or last_state.get("charities")
                    or []
                )
                charity_count = len(charities)
                if charities:
                    richest = max(charities, key=lambda c: c.get("monthly_drain", 0))
                    top_charity = f"{richest.get('name')} (${richest.get('monthly_drain', 0):,.0f}/mo)"
        except json.JSONDecodeError:
            top_charity = None
        enriched.append({
            **dict(row),
            "charity_count": charity_count,
            "top_charity": top_charity,
        })
    return render_template("leaderboard.html", players=enriched)

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


@app.route("/api/email", methods=["POST"])
def api_email():
    data = request.get_json() or {}
    email = data.get("email") or session.get("player_email")
    if email:
        session["player_email"] = email
    if not email:
        return jsonify({"ok": False, "error": "missing email"}), 400
    player = data.get("player") or {}
    stats = data.get("stats") or {}
    html = """
        <h2>Your LottoLife snapshot</h2>
        <p>Here is the latest state exported from the simulator:</p>
    """
    if player:
        html += "<ul>"
        for key, value in player.items():
            html += f"<li><strong>{key}:</strong> {value}</li>"
        html += "</ul>"
    if stats:
        html += "<pre style='background:#0b1222;color:#eef3ff;padding:12px;border-radius:12px;'>"
        html += json.dumps(stats, indent=2)
        html += "</pre>"
    sent = send_resend_email(email, "Your LottoLife snapshot", html)
    return jsonify({"ok": sent})


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
        "player_email",
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

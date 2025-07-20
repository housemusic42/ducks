const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite database
const dbPath = path.join(__dirname, 'game.db');
const db = new sqlite3.Database(dbPath, (err) => {
//const db = new sqlite3.Database('./game.db', (err) => {
    if (err) console.error(err.message);
    console.log('Connected to SQLite database.');
});

// Create tables if they don't exist
db.run(`CREATE TABLE IF NOT EXISTS game_score (
    id INTEGER PRIMARY KEY DEFAULT 1,
    score INTEGER DEFAULT 0,
    round INTEGER DEFAULT 1,
    target INTEGER DEFAULT 10,
    winner TEXT DEFAULT NULL,
    message TEXT DEFAULT NULL,
    game_enabled INTEGER DEFAULT 1,
    admin_message TEXT DEFAULT NULL
)`);


db.run(`CREATE TABLE IF NOT EXISTS used_urls (
    id TEXT,
    round INTEGER,
    PRIMARY KEY (id, round)
)`);

db.run(`CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY
)`);

db.run(`CREATE TABLE IF NOT EXISTS round_winners (
    round INTEGER PRIMARY KEY,
    winner TEXT
)`);



// Load predefined player IDs from a file with the __dirname path
function loadPlayerIDs() {
    const playersPath = path.join(__dirname, 'players.txt');
    fs.readFile(playersPath, 'utf8', (err, data) => {
//fs.readFile('players.txt', 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading players.txt:", err);
            return;
        }
        const ids = data.split(/\r?\n/).filter(line => line.trim() !== '');
        ids.forEach(id => {
            db.run("INSERT OR IGNORE INTO players (id) VALUES (?)", [id], (err) => {
                if (err) console.error(`Error inserting player ${id}:`, err.message);
            });
        });
    });
}
loadPlayerIDs();

// Ensure score entry exists
db.get("SELECT * FROM game_score WHERE id = 1", (err, row) => {
    if (!row) {
        db.run("INSERT INTO game_score (id, score, round, target, winner, message, game_enabled) VALUES (1, 0, 1, 10, NULL, NULL, 1)");
    }
});

// Get current score and round info
app.get('/score', (req, res) => {
    db.get("SELECT score, round, target, winner, message, game_enabled, admin_message FROM game_score WHERE id = 1", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
});

// Get last winners for index page
app.get('/winners', (req, res) => {
    db.all("SELECT round, winner FROM round_winners ORDER BY round DESC LIMIT 10", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const masked = rows.map(row => ({
            round: row.round,
            winner: row.winner ? row.winner.slice(-5) : '-----'
        }));
        res.json(masked);
    });
});

//route for getting the full id of the winners, also creates anew specific admin route
app.get('/admin/full-winners', (req, res) => {
    db.all("SELECT round, winner FROM round_winners ORDER BY round DESC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});


//routes for admin page

app.post('/set-target', (req, res) => {
    const { target } = req.body;
    db.run("UPDATE game_score SET target = ? WHERE id = 1", [target], () => res.redirect('/53f98a3f6f0250065cc8.html'));
});

app.post('/set-round', (req, res) => {
    const { round } = req.body;
    db.run("UPDATE game_score SET round = ? WHERE id = 1", [round], () => res.redirect('/53f98a3f6f0250065cc8.html'));
});

app.post('/reset-score', (req, res) => {
    db.run("UPDATE game_score SET score = 0 WHERE id = 1", () => res.redirect('/53f98a3f6f0250065cc8.html'));
});

app.post('/reset-urls', (req, res) => {
    db.run("DELETE FROM used_urls", () => res.redirect('/53f98a3f6f0250065cc8.html'));
});

app.post('/set-message', (req, res) => {
    const { message } = req.body;
    db.run("UPDATE game_score SET message = ? WHERE id = 1", [message], () => res.redirect('/53f98a3f6f0250065cc8.html'));
});

app.post('/clear-message', (req, res) => {
    db.run("UPDATE game_score SET message = NULL WHERE id = 1", () => res.redirect('/53f98a3f6f0250065cc8.html'));
});

app.post('/add-player', (req, res) => {
    const { id } = req.body;
    db.run("INSERT OR IGNORE INTO players (id) VALUES (?)", [id], () => res.redirect('/53f98a3f6f0250065cc8.html'));
});

app.post('/remove-player', (req, res) => {
    const { id } = req.body;
    db.run("DELETE FROM players WHERE id = ?", [id], () => res.redirect('/53f98a3f6f0250065cc8.html'));
});

app.post('/clear-winners', (req, res) => {
    db.run("DELETE FROM round_winners", () => res.redirect('/53f98a3f6f0250065cc8.html'));
});

//test of admin-message section
app.post('/set-admin-message', (req, res) => {
    const { admin_message } = req.body;
    db.run("UPDATE game_score SET admin_message = ? WHERE id = 1", [admin_message], () => {
        res.redirect('/53f98a3f6f0250065cc8.html');
    });
})

//game on and off route here
app.post('/toggle-game', (req, res) => {
    db.get("SELECT game_enabled FROM game_score WHERE id = 1", (err, row) => {
        if (err) return res.status(500).send("DB Error");

        const newValue = row.game_enabled ? 0 : 1;
        const newMessage = newValue === 0
            ? "The game is currently turned off. Please check back later."
            : null;

        db.run("UPDATE game_score SET game_enabled = ?, message = ? WHERE id = 1",
            [newValue, newMessage],
            () => res.redirect('/53f98a3f6f0250065cc8.html')
        );
    });
});



// Increment score if the ID is pre-approved... some regex for input validation
app.post('/increment', (req, res) => {
    const { id } = req.body;
    const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{6,30}$/;
    if (!id || !VALID_ID_REGEX.test(id)) {
        return res.status(400).json({ error: "Invalid ID format." });
    }

    db.get("SELECT id FROM players WHERE id = ?", [id], (err, validPlayer) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!validPlayer) {
            return res.json({ error: "Invalid player ID. You are not authorized to play." });
        }
        db.get("SELECT * FROM game_score WHERE id = 1", (err, game) => {
            if (!game.game_enabled) {
                return res.status(403).json({ error: "The game is currently turned off." });
            }
            
            //if (err) return res.status(500).json({ error: err.message });

            db.get("SELECT id FROM used_urls WHERE id = ? AND round = ?", [id, game.round], (err, row) => {
                if (row) {
                    return res.json({ error: "You have already played this round.", score: game.score, round: game.round, target: game.target, winner: game.winner });
                }

                db.run("INSERT INTO used_urls (id, round) VALUES (?, ?)", [id, game.round], (err) => {
                    if (err) return res.status(500).json({ error: err.message });

                    let newScore = game.score + 1;

                    if (newScore >= game.target) {
                        db.all("SELECT id FROM used_urls WHERE round = ?", [game.round], (err, rows) => {
                            if (err) return res.status(500).json({ error: err.message });
                            let winner = "No winner";
                            if (rows.length > 0) {
                                const randomIndex = Math.floor(Math.random() * rows.length);
                                winner = rows[randomIndex].id;
                            }

                            db.serialize(() => {
                                db.run("DELETE FROM used_urls");
                                db.run("INSERT OR REPLACE INTO round_winners (round, winner) VALUES (?, ?)", [game.round, winner]);
                                
                                //increment the game and round counts here! 

                                const newRound = game.round + 1;
                                const newTarget = game.target + 0;
                                db.run("UPDATE game_score SET score = 0, round = ?, target = ?, winner = ?, message = ?, game_enabled = 0 WHERE id = 1",
                                //This round has ended! Congratulations to ${winner} who is now the goose.
                                    [newRound, newTarget, winner, `This round has ended - congratulations to ${winner.slice(-5)}! The next round will start soon `], (err) => {
                                        if (err) return res.status(500).json({ error: err.message });
                                        res.json({ score: 0, round: newRound, target: newTarget, winner, message: ` ` });
                                });
                            });
                        });
                    } else {
                        db.run("UPDATE game_score SET score = ? WHERE id = 1", [newScore], (err) => {
                            if (err) return res.status(500).json({ error: err.message });
                            res.json({ score: newScore, round: game.round, target: game.target, winner: game.winner });
                        });
                    }
                });
            });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});


import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './App.css';

// Types for player and dealer state
interface PlayerState {
  balance: number;
  bet: number;
  cards: string[];
  total: number;
}

interface DealerState {
  cards: string[];
  total: number;
}

type GameState = 'LOGIN' | 'BETTING' | 'IN_ROUND' | 'ROUND_OVER';

const initialPlayer: PlayerState = { balance: 100, bet: 0, cards: [], total: 0 };
const initialDealer: DealerState = { cards: [], total: 0 };

// Leaderboard types
interface LeaderboardEntry {
  player_id: string;
  chips: number;
  max_chips: number;
  epoch: number;
  game_count: number;
}

// --- Protocol Client ---
class BlackjackProtocolClient {
  ws: WebSocket | null = null;
  awaitingInput: boolean = false;
  onMessage: ((msg: string) => void) | null = null;
  onClose: (() => void) | null = null;

  connect(url: string, onMessage: (msg: string) => void, onClose: () => void) {
    this.ws = new WebSocket(url);
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.ws.onmessage = (e) => this.handleMessage(e.data);
    this.ws.onclose = () => { if (this.onClose) this.onClose(); };
    this.ws.onerror = () => { if (this.onClose) this.onClose(); };
  }

  handleMessage(data: string) {
    if (this.onMessage) this.onMessage(data);
    if (data.includes('AWAITING INPUT')) {
      this.awaitingInput = true;
    }
  }

  send(cmd: string) {
    if (this.ws && this.awaitingInput) {
      this.ws.send(cmd + '\n');
      this.awaitingInput = false;
    }
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

// --- End Protocol Client ---

const Leaderboard: React.FC = () => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('http://localhost:8080/api/v0/leaderboard?order=chips&limit=3');
        if (!res.ok) throw new Error('Failed to fetch leaderboard');
        const data = await res.json();
        setEntries(data.entries || []);
      } catch (e: any) {
        setError(e.message || 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="leaderboard">
      <h3>Leaderboard</h3>
      {loading && <div className="lb-loading">Loading...</div>}
      {error && <div className="lb-error">{error}</div>}
      {!loading && !error && (
        <ol>
          {entries.slice(0, 3).map((entry, idx) => (
            <li key={entry.player_id}>
              <span className="lb-rank">#{idx + 1}</span> <span className="lb-name">{entry.player_id}</span> <span className="lb-chips">{entry.chips} chips</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

function App() {
  const [gameState, setGameState] = useState<GameState>('LOGIN');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [player, setPlayer] = useState<PlayerState>(initialPlayer);
  const [dealer, setDealer] = useState<DealerState>(initialDealer);
  const [message, setMessage] = useState('');
  const [connecting, setConnecting] = useState(false);
  const protocolRef = useRef<BlackjackProtocolClient | null>(null);
  const [lastRawMsg, setLastRawMsg] = useState('');
  const [lastLogin, setLastLogin] = useState<{ username: string, password: string } | null>(null);
  const keepAliveInterval = useRef<NodeJS.Timeout | null>(null);

  // --- Protocol Handlers ---
  const connectAndLogin = (user: string, pass: string) => {
    setConnecting(true);
    setMessage('Connecting...');
    const proto = new BlackjackProtocolClient();
    protocolRef.current = proto;
    proto.connect('ws://localhost:4223', handleProtocolMessage, handleProtocolClose);
    proto.ws!.onopen = () => {
      console.debug('WebSocket opened');
      proto.send(`LOGIN ${user} ${pass}`);
      setConnecting(false);
      setMessage('Logging in...');
      setLastLogin({ username: user, password: pass });
      // Start keepalive
      if (keepAliveInterval.current) clearInterval(keepAliveInterval.current);
      keepAliveInterval.current = setInterval(() => {
        if (proto.awaitingInput) {
          proto.send('STATUS');
          console.debug('Sent keepalive STATUS');
        }
      }, 3000);
    };
    proto.ws!.onerror = (e) => {
      console.error('WebSocket error', e);
      setMessage('WebSocket error: ' + (e instanceof Event ? 'Event' : JSON.stringify(e)));
    };
    proto.ws!.onclose = (e) => {
      console.warn('WebSocket closed', e);
      setMessage('WebSocket closed.');
      if (keepAliveInterval.current) clearInterval(keepAliveInterval.current);
      // Attempt reconnect if we have credentials
      if (lastLogin) {
        setTimeout(() => {
          setMessage('Reconnecting...');
          console.debug('Attempting auto-reconnect...');
          connectAndLogin(lastLogin.username, lastLogin.password);
        }, 1000);
      }
    };
  };

  const handleLogin = () => {
    connectAndLogin(username, password);
  };

  function handleProtocolClose() {
    setGameState('LOGIN');
    setMessage('Connection lost. Please login again.');
    protocolRef.current = null;
    if (keepAliveInterval.current) clearInterval(keepAliveInterval.current);
  }

  function handleProtocolMessage(msg: string) {
    setLastRawMsg(msg);
    console.debug('Protocol message:', msg);
    // Parse protocol messages and update state
    if (msg.startsWith('OK user:')) {
      // Example: OK user:foo balance:100
      const match = msg.match(/balance:(\d+)/);
      const balance = match ? parseInt(match[1], 10) : 100;
      setPlayer(p => ({ ...p, balance, bet: 0, cards: [], total: 0 }));
      setDealer({ cards: [], total: 0 });
      setGameState('BETTING');
      setMessage('Logged in! Place your bet.');
    } else if (msg.startsWith('OK balance:')) {
      // Example: OK balance:90 dealer:K♦ you:17 10♠ 7♥
      const balMatch = msg.match(/balance:(\d+)/);
      const dealerMatch = msg.match(/dealer:([^ ]+)/);
      const youMatch = msg.match(/you:(\d+) ([^ ]+) ([^ ]+)/);
      const balance = balMatch ? parseInt(balMatch[1], 10) : 0;
      const dealerCard = dealerMatch ? dealerMatch[1] : '?';
      const youTotal = youMatch ? parseInt(youMatch[1], 10) : 0;
      const youCards = youMatch ? [youMatch[2], youMatch[3]] : [];
      setPlayer(p => ({ ...p, balance, bet: p.bet, cards: youCards, total: youTotal }));
      setDealer({ cards: [dealerCard], total: cardValue(dealerCard) });
      setGameState('IN_ROUND');
      setMessage('Your move!');
    } else if (msg.startsWith('OK')) {
      // For HIT, DOUBLE, etc. (not initial deal)
      // Example: OK you:22 10♠ 7♥ 5♣
      const youMatch = msg.match(/you:(\d+)((?: [^ ]+)+)/);
      if (youMatch) {
        const youTotal = parseInt(youMatch[1], 10);
        const youCards = youMatch[2].trim().split(' ');
        setPlayer(p => ({ ...p, cards: youCards, total: youTotal }));
        setMessage('Your move!');
      }
    } else if (msg.startsWith('BLACKJACK')) {
      setMessage('Blackjack! You win!');
      setGameState('ROUND_OVER');
    } else if (msg.startsWith('DEALER BLACKJACK')) {
      setMessage('Dealer has blackjack. You lose.');
      setGameState('ROUND_OVER');
    } else if (msg.startsWith('PUSH BOTH BLACKJACK')) {
      setMessage('Push! Both have blackjack.');
      setGameState('ROUND_OVER');
    } else if (msg.startsWith('PUSH')) {
      setMessage('Push! It\'s a tie.');
      setGameState('ROUND_OVER');
    } else if (msg.startsWith('WIN')) {
      setMessage('You win!');
      setGameState('ROUND_OVER');
    } else if (msg.startsWith('LOSE')) {
      setMessage('You lose.');
      setGameState('ROUND_OVER');
    } else if (msg.startsWith('ERROR')) {
      setMessage(msg);
      setGameState('BETTING');
    } else if (msg.startsWith('DEALER')) {
      // Example: DEALER 18 K♦ 8♠
      const parts = msg.split(' ');
      const total = parseInt(parts[1], 10);
      const cards = parts.slice(2);
      setDealer({ cards, total });
    }
  }

  // Helper to get card value for initial dealer card
  function cardValue(card: string): number {
    if (!card) return 0;
    const v = card.replace(/[^0-9JQKA]/g, '');
    if (v === 'A') return 11;
    if (v === 'K' || v === 'Q' || v === 'J') return 10;
    return parseInt(v, 10) || 0;
  }

  // --- Game Actions ---
  const handleBet = (amount: number) => {
    setPlayer(p => ({ ...p, bet: amount, balance: p.balance - amount }));
    setMessage('Placing bet...');
    protocolRef.current?.send(`BET ${amount}`);
  };

  const handleAction = (action: 'HIT' | 'STAND' | 'DOUBLE') => {
    setMessage(action.charAt(0) + action.slice(1).toLowerCase() + '...');
    protocolRef.current?.send(action);
  };

  // Reset for new round
  const handleNewRound = () => {
    setPlayer(p => ({ ...initialPlayer, balance: p.balance }));
    setDealer(initialDealer);
    setGameState('BETTING');
    setMessage('Place your bet.');
  };

  // Clean up keepalive on unmount
  React.useEffect(() => {
    return () => {
      if (keepAliveInterval.current) clearInterval(keepAliveInterval.current);
    };
  }, []);

  return (
    <div className="App">
      {gameState !== 'LOGIN' && <Leaderboard />}
      <h1>Blackjack</h1>
      {gameState === 'LOGIN' && (
        <div className="login-screen">
          <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
          <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <button onClick={handleLogin} disabled={!username || !password}>Login</button>
          <div style={{ marginTop: 16, color: '#f9d923', fontSize: '0.95rem' }}>
            Debug: {message}
          </div>
        </div>
      )}
      {gameState !== 'LOGIN' && (
        <div className="game-table">
          <div className="dealer-area">
            <h2>Dealer</h2>
            <div className="cards-row">
              <AnimatePresence>
                {dealer.cards.map((c, i) => (
                  <motion.span
                    className="card"
                    key={c + i}
                    initial={{ opacity: 0, y: -30, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 30, scale: 0.8 }}
                    transition={{ duration: 0.4, delay: i * 0.15 }}
                  >
                    {c}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
            <div>Total: {dealer.cards.length > 0 ? dealer.total : '?'}</div>
          </div>
          <div className="player-area">
            <h2>You</h2>
            <div className="cards-row">
              <AnimatePresence>
                {player.cards.map((c, i) => (
                  <motion.span
                    className="card"
                    key={c + i}
                    initial={{ opacity: 0, y: 30, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -30, scale: 0.8 }}
                    transition={{ duration: 0.4, delay: i * 0.15 }}
                  >
                    {c}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
            <div>Total: {player.cards.length > 0 ? player.total : '?'}</div>
          </div>
          <div className="controls">
            {gameState === 'BETTING' && (
              <>
                <button onClick={() => handleBet(10)} disabled={player.balance < 10}>Bet 10</button>
                <button onClick={() => handleBet(25)} disabled={player.balance < 25}>Bet 25</button>
                <button onClick={() => handleBet(50)} disabled={player.balance < 50}>Bet 50</button>
              </>
            )}
            {gameState === 'IN_ROUND' && (
              <>
                <button onClick={() => handleAction('HIT')}>Hit</button>
                <button onClick={() => handleAction('STAND')}>Stand</button>
                <button onClick={() => handleAction('DOUBLE')} disabled={player.balance < player.bet}>Double</button>
              </>
            )}
            {gameState === 'ROUND_OVER' && (
              <button onClick={handleNewRound}>New Round</button>
            )}
          </div>
          <div className="status-bar">
            <div>Balance: ${player.balance}</div>
            <div>Bet: ${player.bet}</div>
            <div className="message">{message}</div>
          </div>
          <div style={{ marginTop: 8, color: '#f9d923', fontSize: '0.95rem' }}>
            Debug: Last protocol msg: {lastRawMsg}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

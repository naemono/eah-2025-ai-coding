import React, { useState } from 'react';
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

function App() {
  const [gameState, setGameState] = useState<GameState>('LOGIN');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [player, setPlayer] = useState<PlayerState>(initialPlayer);
  const [dealer, setDealer] = useState<DealerState>(initialDealer);
  const [message, setMessage] = useState('');

  // Placeholder for login handler
  const handleLogin = () => {
    setGameState('BETTING');
    setMessage('Logged in! Place your bet.');
  };

  // Placeholder for bet handler
  const handleBet = (amount: number) => {
    setPlayer(p => ({ ...p, bet: amount, balance: p.balance - amount }));
    setGameState('IN_ROUND');
    setMessage('Dealing cards...');
    // Animate card dealing
    setTimeout(() => {
      setPlayer(p => ({ ...p, cards: ['10♠', '7♥'], total: 17 }));
      setDealer({ cards: ['K♦'], total: 10 });
      setMessage('Your move!');
    }, 800);
  };

  // Placeholder for action handler
  const handleAction = (action: 'HIT' | 'STAND' | 'DOUBLE') => {
    if (action === 'HIT') {
      setMessage('Dealing a card...');
      setTimeout(() => {
        setPlayer(p => ({ ...p, cards: [...p.cards, '5♣'], total: p.total + 5 }));
        setMessage('You drew a 5♣!');
      }, 600);
    } else if (action === 'STAND') {
      setMessage('Standing. Dealer reveals...');
      setTimeout(() => {
        setDealer(d => ({ ...d, cards: ['K♦', '8♠'], total: 18 }));
        setGameState('ROUND_OVER');
        setMessage('Dealer has 18. You lose!');
      }, 1000);
    } else if (action === 'DOUBLE') {
      setMessage('Doubling down!');
      setTimeout(() => {
        setPlayer(p => ({ ...p, bet: p.bet * 2, cards: [...p.cards, '2♦'], total: p.total + 2 }));
        setDealer(d => ({ ...d, cards: ['K♦', '8♠'], total: 18 }));
        setGameState('ROUND_OVER');
        setMessage('Dealer has 18. You lose!');
      }, 1000);
    }
  };

  // Reset for new round
  const handleNewRound = () => {
    setPlayer(p => ({ ...initialPlayer, balance: p.balance }));
    setDealer(initialDealer);
    setGameState('BETTING');
    setMessage('Place your bet.');
  };

  return (
    <div className="App">
      <h1>Blackjack</h1>
      {gameState === 'LOGIN' && (
        <div className="login-screen">
          <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
          <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <button onClick={handleLogin} disabled={!username || !password}>Login</button>
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
        </div>
      )}
    </div>
  );
}

export default App;

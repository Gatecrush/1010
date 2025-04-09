import { useState, useEffect } from 'react';
import './App.css';
import { createDeck, shuffleDeck, getValue } from './modules/deck';
import { dealInitialCards } from './modules/dealing';
import { handleCapture, handleBuild, handlePair } from './modules/turns'; // Import handlePair
import { calculateScores } from './modules/scoring';
// Removed unused import: isValidCapture
import { CaptureValidator, areItemSetsEqual } from './modules/captureLogic.js'; // Import areItemSetsEqual
import { validateBuild } from './modules/buildLogic.js'; // Use validateBuild (or remove if only used in turns.js)

function App() {
  const [deck, setDeck] = useState([]);
  const [player1Hand, setPlayer1Hand] = useState([]);
  const [player2Hand, setPlayer2Hand] = useState([]);
  const [tableItems, setTableItems] = useState([]); // Renamed from tableCards
  const [player1Score, setPlayer1Score] = useState(0);
  const [player2Score, setPlayer2Score] = useState(0);
  const [currentPlayer, setCurrentPlayer] = useState(1);
  const [lastCapturer, setLastCapturer] = useState(null);
  const [gamePhase, setGamePhase] = useState('initialDeal');
  const [message, setMessage] = useState('');
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedTableItems, setSelectedTableItems] = useState([]); // Renamed
  const [player1Pile, setPlayer1Pile] = useState([]);
  const [player2Pile, setPlayer2Pile] = useState([]);
  const [hasPlayedCard, setHasPlayedCard] = useState(false);
  const [round, setRound] = useState(1);
  const [isRoundOver, setIsRoundOver] = useState(false);

  useEffect(() => {
    resetGame();
  }, []);

  const resetGame = () => {
    const newDeck = createDeck();
    shuffleDeck(newDeck);
    setDeck(newDeck);
    setPlayer1Hand([]);
    setPlayer2Hand([]);
    setTableItems([]); // Use new state name
    setPlayer1Score(0);
    setPlayer2Score(0);
    setCurrentPlayer(1);
    setLastCapturer(null);
    setGamePhase('initialDeal');
    setMessage('');
    setSelectedCard(null);
    setSelectedTableItems([]); // Use new state name
    setPlayer1Pile([]);
    setPlayer2Pile([]);
    setHasPlayedCard(false);
    setRound(1);
    setIsRoundOver(false);
  };

  const initializeDeal = () => {
    let { p1Hand, p2Hand, table, updatedDeck } = dealInitialCards(deck);
    setPlayer1Hand(p1Hand);
    setPlayer2Hand(p2Hand);
    // Initialize table with card objects, ensuring each gets a unique ID
    setTableItems(table.map((card, index) => ({ type: 'card', ...card, id: `card-${card.suitRank}-${index}-${Date.now()}` })));
    setDeck(updatedDeck);
    setGamePhase('play');
    setMessage("Player 1's turn");
    setHasPlayedCard(false);
    setIsRoundOver(false);
  };

  // Note: canCapture and canBuild might need adjustments later based on build logic
  // These are less critical now that validation happens in handleCapture/handleBuild
  const canCapture = (card, currentTableItems) => {
    // Basic check, real validation in CaptureValidator
    return CaptureValidator.getValidCaptures(card, currentTableItems).length > 0;
  };

  const canBuild = (card, currentTableItems, playerHand) => {
     // Basic check, real validation in validateBuild
     return validateBuild(card, currentTableItems, playerHand).isValid;
  };

  const playTrail = () => {
    // Rule: Cannot trail if controlling a build OR a pair
    const playerControlsBuild = tableItems.some(item => item.type === 'build' && item.controller === currentPlayer);
    const playerControlsPair = tableItems.some(item => item.type === 'pair' && item.controller === currentPlayer);
    if (playerControlsBuild || playerControlsPair) {
        alert("You cannot trail while controlling a build or a pair.");
        return;
    }
     // Rule: Cannot trail the last capturing card for a controlled build
     if (isLastCapturingCardForControlledBuild(selectedCard, currentPlayer === 1 ? player1Hand : player2Hand, tableItems, currentPlayer)) {
        alert("You cannot trail the last card needed to capture your build.");
        return;
     }

    if (selectedCard && !hasPlayedCard && selectedTableItems.length === 0) { // Ensure no table items selected for trail
      // Remove the played card from the player's hand
      if (currentPlayer === 1) {
        setPlayer1Hand(player1Hand.filter(card => card.suitRank !== selectedCard.suitRank));
      } else {
        setPlayer2Hand(player2Hand.filter(card => card.suitRank !== selectedCard.suitRank));
      }
      // Add trailed card to table with a unique ID
      setTableItems([...tableItems, { type: 'card', ...selectedCard, id: `card-${selectedCard.suitRank}-${Date.now()}` }]);

      setHasPlayedCard(true); // Mark card as played
      setSelectedCard(null); // Deselect card
      switchPlayer(); // Switch player *after* state updates
    } else if (selectedTableItems.length > 0) {
        alert("Deselect table items before trailing.");
    }
  };

  const playCapture = () => {
    if (selectedCard && selectedTableItems.length > 0 && !hasPlayedCard) {

      // Proceed with capture logic using handleCapture
      const captureResult =
        handleCapture(
          selectedCard,
          selectedTableItems, // Pass selected items
          currentPlayer,
          player1Score, // Pass current scores
          player2Score,
          tableItems, // Pass current table items
          lastCapturer
        );

      if (!captureResult.success) {
          alert(`Invalid Capture: ${captureResult.message}`);
          // Do not change state or switch player on invalid capture
          return;
      }

      // --- Capture successful ---

      // Remove played card from hand FIRST
      let currentHand = currentPlayer === 1 ? player1Hand : player2Hand;
      const updatedHand = currentHand.filter(card => card.suitRank !== selectedCard.suitRank);
      if (currentPlayer === 1) {
          setPlayer1Hand(updatedHand);
      } else {
          setPlayer2Hand(updatedHand);
      }

      // Update state based on handleCapture results
      setPlayer1Score(captureResult.newP1Score);
      setPlayer2Score(captureResult.newP2Score);
      setTableItems(captureResult.newTableItems); // Update table items
      setLastCapturer(captureResult.newLastCapturer);
      setMessage(captureResult.message); // Use message from handleCapture

      // Add captured cards to the correct player's pile
      if (captureResult.capturedCards && captureResult.capturedCards.length > 0) {
          if (currentPlayer === 1) {
            setPlayer1Pile([...player1Pile, ...captureResult.capturedCards]);
            setPlayer1Hand(player1Hand.filter(card => card.suitRank !== selectedCard.suitRank));
          } else {
            setPlayer2Pile([...player2Pile, ...captureResult.capturedCards]);
            setPlayer2Hand(player2Hand.filter(card => card.suitRank !== selectedCard.suitRank));
          }
      }

      setHasPlayedCard(true); // Mark card as played
      setSelectedCard(null); // Deselect card
      setSelectedTableItems([]); // Clear selected table items
      switchPlayer(); // Switch player *after* state updates
    }
  };


  const playBuild = () => {
    if (selectedCard && selectedTableItems.length > 0 && !hasPlayedCard) {

      // Use handleBuild which includes validation
      const buildResult = handleBuild(
        selectedCard,
        selectedTableItems,
        currentPlayer,
        tableItems, // Pass current table items
        currentPlayer === 1 ? player1Hand : player2Hand // Pass current player's hand
      );

      if (!buildResult.success) {
        alert(`Invalid Build: ${buildResult.message}`);
        // Do not switch player or clear selections on invalid build
        return;
      }

      // --- Build successful ---

      // Remove the played card from the player's hand FIRST
      let currentHand = currentPlayer === 1 ? player1Hand : player2Hand;
      const updatedHand = currentHand.filter(card => card.suitRank !== selectedCard.suitRank);
       if (currentPlayer === 1) {
           setPlayer1Hand(updatedHand);
       } else {
           setPlayer2Hand(updatedHand);
       }

      setTableItems(buildResult.newTableItems); // Update table with the result from handleBuild
      setMessage(buildResult.message); // Show build message
      setHasPlayedCard(true); // Mark card as played
      setSelectedCard(null); // Deselect card
      setSelectedTableItems([]); // Clear selected table items
      switchPlayer(); // Switch player *after* state updates
    }
  };

  const playPair = () => {
      if (selectedCard && selectedTableItems.length > 0 && !hasPlayedCard) {
          // Call handlePair which includes validation
          const pairResult = handlePair(
              selectedCard,
              selectedTableItems,
              currentPlayer,
              tableItems,
              currentPlayer === 1 ? player1Hand : player2Hand
          );

          if (!pairResult.success) {
              alert(`Invalid Pair: ${pairResult.message}`);
              return;
          }

          // --- Pair successful ---
          let currentHand = currentPlayer === 1 ? player1Hand : player2Hand;
          const updatedHand = currentHand.filter(card => card.suitRank !== selectedCard.suitRank);
          if (currentPlayer === 1) { setPlayer1Hand(updatedHand); } else { setPlayer2Hand(updatedHand); }

          setTableItems(pairResult.newTableItems);
          setMessage(pairResult.message);
          setHasPlayedCard(true);
          setSelectedCard(null);
          setSelectedTableItems([]);
          switchPlayer();
      }
  };


  const switchPlayer = () => {
    const nextPlayer = currentPlayer === 1 ? 2 : 1;
    setCurrentPlayer(nextPlayer);
    // Reset message only if it wasn't a sweep or specific build message
    if (!message.toLowerCase().includes('sweep') && !message.toLowerCase().includes('built') && !message.toLowerCase().includes('paired')) {
        setMessage(`Player ${nextPlayer}'s turn`);
    }
    // Ensure message is updated if it was previously a build/sweep/pair message
    else if (message.toLowerCase().includes('sweep') || message.toLowerCase().includes('built') || message.toLowerCase().includes('paired')) {
         setTimeout(() => setMessage(`Player ${nextPlayer}'s turn`), 1500); // Show build/sweep msg briefly
    }

    setHasPlayedCard(false); // Reset for the new player's turn
  };

  const calculateFinalScores = () => {
    // Award remaining table cards to the last capturer
    let finalP1Pile = [...player1Pile];
    let finalP2Pile = [...player2Pile];
    // Flatten remaining items into cards before adding
    const remainingCards = tableItems.flatMap(item => item.type === 'card' ? [item] : item.cards); // Includes cards from builds AND pairs

    if (lastCapturer === 1) {
        finalP1Pile = [...finalP1Pile, ...remainingCards];
    } else if (lastCapturer === 2) {
        finalP2Pile = [...finalP2Pile, ...remainingCards];
    } else {
        // Handle case where no one captured (optional, depends on rules variant)
        console.log("No last capturer, remaining cards discarded or split?");
    }
    setTableItems([]); // Clear table

    const { p1Score, p2Score } = calculateScores(
      finalP1Pile, // Use the final piles
      finalP2Pile,
      0, // Start score calculation from 0 for the final round
      0
    );
    setPlayer1Score(p1Score);
    setPlayer2Score(p2Score);
    setGamePhase('gameOver');
  };

  const handleGameOver = () => {
    calculateFinalScores();
  };

  const selectCard = (card) => {
    // Allow selecting only if it's the current player's turn and they haven't played
    if (
        ((currentPlayer === 1 && player1Hand.some(c => c.suitRank === card.suitRank)) ||
         (currentPlayer === 2 && player2Hand.some(c => c.suitRank === card.suitRank))) &&
        !hasPlayedCard // Can only select if haven't played yet
       ) {
         if (selectedCard && selectedCard.suitRank === card.suitRank) {
            setSelectedCard(null); // Deselect if clicking the same card
            setSelectedTableItems([]); // Also clear table selection when deselecting hand card
         } else {
            setSelectedCard(card);
            setSelectedTableItems([]); // Clear table selection when selecting a new hand card
         }
    } else if (hasPlayedCard) {
        console.log("Card already played this turn.");
    } else {
        console.log("Cannot select opponent's card.");
    }
  };

  const selectTableItem = (item) => { // Renamed function
    // Allow selecting/deselecting table cards only if a player card is selected
    // Ensure item has an ID before proceeding
    if (!item || !item.id) {
        console.error("Attempted to select table item without ID:", item);
        return;
    };

    if (selectedCard && !hasPlayedCard) { // Can only select table items if hand card selected AND haven't played
        setSelectedTableItems(prevSelected => { // Use new state setter
          if (prevSelected.some(i => i.id === item.id)) { // Check if item with same ID is already selected
            return prevSelected.filter(i => i.id !== item.id); // Deselect
          } else {
            // Prevent selecting compound builds if trying to build (simple build logic)
            // More complex validation might be needed depending on action intent
            /* if (item.type === 'build' && item.isCompound) {
                alert("Cannot select a compound build for this action."); // Inform user
                return prevSelected; // Don't add the compound build
            } */
            return [...prevSelected, item]; // Select (add the item with its ID)
          }
        });
    } else if (!selectedCard) {
        console.log("Select a card from your hand first to interact with table cards.");
    } else if (hasPlayedCard) {
        console.log("Cannot select table items after playing a card this turn.");
    }
  };


  // Combined rendering function for cards and builds on the TABLE
  const renderTableItem = (item, index) => {
    if (!item) {
      return null;
    }

    // --- Render Card on Table ---
    if (item.type === 'card') {
      const card = item; // For clarity
      // Check if this specific table item instance is selected (using ID)
      const isTableItemSelected = selectedTableItems.some(i => i.id === card.id);
      const suitColor = card.suit === 'H' || card.suit === 'D' ? 'red' : 'black';
      // Can click table item only if a hand card is selected AND turn not finished
      const canClickTableItem = selectedCard && !hasPlayedCard;
      const uniqueId = card.id || `card-${card.suitRank}-${index}-${Date.now()}`; // Ensure ID exists

      return (
        <div
          key={uniqueId} // Use unique key
          className={`card table-card ${isTableItemSelected ? 'selected-table-card' : ''} ${canClickTableItem ? '' : 'disabled'}`}
          onClick={() => canClickTableItem && selectTableItem({ ...card, id: uniqueId })} // Pass unique ID
        >
          <div className="rank" style={{ color: suitColor }}>{card.rank}</div>
          <div className="suit" style={{ color: suitColor }}>{ { 'C': '♣', 'D': '♦', 'H': '♥', 'S': '\u2660' }[card.suit] }</div>
        </div>
      );
    }

    // --- Render Build on Table ---
    if (item.type === 'build') {
      const build = item;
      // Check if this specific build instance is selected
      const isTableItemSelected = selectedTableItems.some(i => i.id === build.id);
      // Can click table item only if a hand card is selected AND turn not finished
      const canClickTableItem = selectedCard && !hasPlayedCard;
      const uniqueId = build.id; // Builds should always have an ID from handleBuild

      return (
        <div
          key={uniqueId} // Use unique key for build
          className={`build ${isTableItemSelected ? 'selected-table-card' : ''} ${canClickTableItem ? '' : 'disabled'} ${build.isCompound ? 'compound-build' : 'simple-build'}`} // Add classes for type
          onClick={() => canClickTableItem && selectTableItem(build)} // Pass the whole build object (with ID)
          title={`Cards: ${build.cards.map(c => c.rank + c.suit).join(', ')} Controller: P${build.controller} ${build.isCompound ? '(Compound)' : '(Simple)'}`} // Tooltip
          >
            <div className="build-value">Build {build.value}</div>
            {/* Basic representation - maybe show top card or count */}
            <div className="build-cards">({build.cards.length} cards)</div>
            {/* Removed incorrect rank/suit divs from here */}
        </div>
      );
    }

    // --- Render Pair on Table ---
    if (item.type === 'pair') {
        const pair = item;
        const isTableItemSelected = selectedTableItems.some(i => i.id === pair.id);
        const canClickTableItem = selectedCard && !hasPlayedCard;
        const uniqueId = pair.id;

        return (
            <div
              key={uniqueId}
              className={`pair ${isTableItemSelected ? 'selected-table-card' : ''} ${canClickTableItem ? '' : 'disabled'}`}
              onClick={() => canClickTableItem && selectTableItem(pair)}
              title={`Cards: ${pair.cards.map(c => c.rank + c.suit).join(', ')} Controller: P${pair.controller}`}
            >
                <div className="pair-rank">Pair {pair.rank}s</div>
                <div className="pair-cards">({pair.cards.length} cards)</div>
            </div>
        );
    }
    return null; // Should not happen
  };

  // Specific renderer for player HAND cards
  const renderHandCard = (card, index) => {
     if (!card) return null;

     const isCurrentPlayersTurn = (currentPlayer === 1 && player1Hand.some(c => c.suitRank === card.suitRank)) ||
                                 (currentPlayer === 2 && player2Hand.some(c => c.suitRank === card.suitRank));
     const isSelected = selectedCard && selectedCard.suitRank === card.suitRank;
     const suitColor = card.suit === 'H' || card.suit === 'D' ? 'red' : 'black';
     // Can click hand card only if it's this player's turn AND they haven't played yet
     const canClickPlayerCard = isCurrentPlayersTurn && !hasPlayedCard;

     return (
       <div
         key={`hand-${card.suitRank}-${index}`}
         className={`card hand-card ${isSelected ? 'selected' : ''} ${canClickPlayerCard ? '' : 'disabled'}`}
         onClick={() => canClickPlayerCard && selectCard(card)}
       >
         <div className="rank" style={{ color: suitColor }}>{card.rank}</div>
         <div className="suit" style={{ color: suitColor }}>
           { { 'C': '♣', 'D': '♦', 'H': '♥', 'S': '\u2660' }[card.suit] }
         </div>
       </div>
     );
  };

  // Deals 4 cards to each player from the deck
  const dealNewCards = (currentDeck) => {
    const p1HandAdd = [];
    const p2HandAdd = [];
    let remainingDeck = [...currentDeck];

    for (let i = 0; i < 4; i++) {
      if (remainingDeck.length > 0) p1HandAdd.push(remainingDeck.pop());
      if (remainingDeck.length > 0) p2HandAdd.push(remainingDeck.pop());
    }

    return {
      p1HandAdd,
      p2HandAdd,
      updatedDeck: remainingDeck,
    };
  };

  // Function to start a new round of dealing
  const startNewDealRound = () => {
    if (deck.length > 0) {
      const { p1HandAdd, p2HandAdd, updatedDeck } = dealNewCards(deck);
      setPlayer1Hand(p1HandAdd); // Replace hand with new cards
      setPlayer2Hand(p2HandAdd); // Replace hand with new cards
      setDeck(updatedDeck);
      setIsRoundOver(false); // Round is no longer over
      setMessage(`Round ${round + 1} - Player ${currentPlayer}'s turn`); // Update message
      setRound(round + 1); // Increment round counter
      setHasPlayedCard(false); // Reset played card status
    } else {
      // No more cards in the deck, end the game
      handleGameOver();
    }
  };

  // Effect to detect when both hands are empty (end of a deal round)
  useEffect(() => {
    // Only trigger if in 'play' phase and not already marked as round over
    if (player1Hand.length === 0 && player2Hand.length === 0 && gamePhase === 'play' && !isRoundOver && deck.length > 0) {
      setIsRoundOver(true);
      setMessage("Dealing new cards...");
    } else if (player1Hand.length === 0 && player2Hand.length === 0 && gamePhase === 'play' && deck.length === 0 && !isRoundOver) { // Added !isRoundOver check
        // Both hands empty AND deck empty -> Game Over
        // Ensure game over isn't triggered multiple times
        setGamePhase('ending'); // Intermediate state to prevent re-trigger
        handleGameOver();
    }
  }, [player1Hand, player2Hand, gamePhase, isRoundOver, deck]); // Add deck and isRoundOver to dependencies

  // Effect to automatically deal new cards when a round ends
  useEffect(() => {
    if (isRoundOver) {
      // Use a small timeout to allow the "Dealing new cards..." message to display briefly
      const timer = setTimeout(() => {
        // Check if game hasn't ended in the meantime
        if (gamePhase === 'play') {
            startNewDealRound();
        }
      }, 1500); // Delay for 1.5 seconds
      return () => clearTimeout(timer); // Cleanup timer on unmount or if isRoundOver changes
    }
  }, [isRoundOver, gamePhase]); // Trigger only when isRoundOver changes to true, check gamePhase

  // --- Rule Enforcement Calculations ---
  const playerControlsBuild = tableItems.some(item => item.type === 'build' && item.controller === currentPlayer);
  const playerControlsPair = tableItems.some(item => item.type === 'pair' && item.controller === currentPlayer);

  // Helper to check if the selected card is the last one matching a controlled build
  const isLastCapturingCardForControlledBuild = (cardToCheck, hand, currentTableItems, playerNum) => {
      if (!cardToCheck) return false;
      const controlledBuilds = currentTableItems.filter(item => item.type === 'build' && item.controller === playerNum);
      if (controlledBuilds.length === 0) return false;

      const buildValue = (rank) => rank === 'A' ? 1 : getValue(rank); // Ace=1 for builds

      return controlledBuilds.some(build => {
          // Is the selected card the one needed to capture this build?
          const isSelectedCardMatcher = buildValue(cardToCheck.rank) === build.value;
          if (!isSelectedCardMatcher) return false;

          // Count how many cards in hand match the build value
          const matchingCardCount = hand.filter(c => buildValue(c.rank) === build.value).length;
          return matchingCardCount === 1; // If only one matches, it's the last one
      });
  };

  // Calculate if the current selection forces capture of a controlled build
  const mustCaptureControlledBuild = () => {
      if (!selectedCard || !playerControlsBuild) return false;

      const hand = currentPlayer === 1 ? player1Hand : player2Hand;
      const isLastCard = isLastCapturingCardForControlledBuild(selectedCard, hand, tableItems, currentPlayer);
      if (!isLastCard) return false;

      // Find the specific build(s) this card is the last capturer for
      const buildValue = (rank) => rank === 'A' ? 1 : getValue(rank);
      const targetBuildValue = buildValue(selectedCard.rank);
      const matchingControlledBuilds = tableItems.filter(item =>
          item.type === 'build' &&
          item.controller === currentPlayer &&
          item.value === targetBuildValue
      );

      // Check if the selected table items *only* contain one of these required builds
      if (selectedTableItems.length === 1 && selectedTableItems[0].type === 'build') {
          return matchingControlledBuilds.some(build => build.id === selectedTableItems[0].id);
      }

      return false; // If multiple items selected, or wrong item selected, it's not a forced capture (yet)
  };

  const disableTrail = !selectedCard || hasPlayedCard || selectedTableItems.length > 0 || playerControlsBuild || playerControlsPair || isLastCapturingCardForControlledBuild(selectedCard, currentPlayer === 1 ? player1Hand : player2Hand, tableItems, currentPlayer);
  const disableCapture = !selectedCard || selectedTableItems.length === 0 || hasPlayedCard || (isLastCapturingCardForControlledBuild(selectedCard, currentPlayer === 1 ? player1Hand : player2Hand, tableItems, currentPlayer) && !mustCaptureControlledBuild());
  const disableBuild = !selectedCard || selectedTableItems.length === 0 || hasPlayedCard || isLastCapturingCardForControlledBuild(selectedCard, currentPlayer === 1 ? player1Hand : player2Hand, tableItems, currentPlayer);
  const disablePair = !selectedCard || selectedTableItems.length === 0 || hasPlayedCard || selectedTableItems.some(i => i.type !== 'card');


  return (
    <div className="App">
      <h1>Omlongo</h1>
      {gamePhase === 'initialDeal' && (
        <button onClick={initializeDeal}>Deal Initial Cards</button>
      )}

      {(gamePhase === 'play' || gamePhase === 'ending') && ( // Show board during play and ending phase
        <div className="game-board">
          {/* Player 1 Area */}
          <div className={`player-area ${currentPlayer === 1 ? 'current-player' : ''}`}>
            <h2>Player 1</h2>
            <div className="player-info">
              <div className="score">Score: {player1Score}</div>
              <div>Pile: {player1Pile.length} cards</div>
              <div className="hand"> {player1Hand.map(renderHandCard)} </div>
            </div>
          </div>

          {/* Table Area */}
          <div className="table-area">
            <h2>Table ({tableItems.length} items)</h2>
             {/* Display Builds separately if implemented */}
            <div className="table-items"> {tableItems.map(renderTableItem)} </div>
             <p>Round: {round}</p>
             <p>{message}</p>
          </div>

          {/* Player 2 Area */}
          <div className={`player-area ${currentPlayer === 2 ? 'current-player' : ''}`}>
            <h2>Player 2</h2>
             <div className="player-info">
              <div className="score">Score: {player2Score}</div>
               <div>Pile: {player2Pile.length} cards</div>
              <div className="hand"> {player2Hand.map(renderHandCard)} </div>
            </div>
          </div>

          {/* Actions Area */}
          <div className="actions">
            {selectedCard && <p>Selected: {selectedCard.rank}{selectedCard.suit}</p>}
            {/* Display selected item types and values/ranks */}
            {selectedTableItems.length > 0 && <p>Table Selected: {selectedTableItems.map(i => i.type === 'card' ? `${i.rank}${i.suit}` : `Build ${i.value}`).join(', ')}</p>}
            {/* Disable Trail if: no card selected OR card played OR items selected OR player controls a build */}
            <button
                onClick={playTrail}
                disabled={disableTrail}
                title={playerControlsBuild ? "Cannot trail when controlling a build" : (isLastCapturingCardForControlledBuild(selectedCard, currentPlayer === 1 ? player1Hand : player2Hand, tableItems, currentPlayer) ? "Cannot trail last capturing card for controlled build" : "")}
            >
                Trail
            </button>
             {/* Disable Capture if: no card selected OR no items selected OR card played OR trying to play last capturing card for non-build capture */}
            <button
                onClick={playCapture}
                disabled={disableCapture}
                title={disableCapture && !hasPlayedCard && selectedTableItems.length > 0 ? "Cannot capture with last capturing card unless capturing the controlled build" : ""}
            >
                Capture
            </button>
             {/* Disable Build if: no card selected OR no items selected OR card played OR trying to play last capturing card */}
            <button
                onClick={playBuild}
                disabled={disableBuild}
                 title={disableBuild && !hasPlayedCard && selectedTableItems.length > 0 ? "Cannot build with last capturing card for controlled build" : ""}
           >
                Build
            </button>
            {/* Add Pair button */}
            <button
                onClick={playPair}
                disabled={disablePair}
            >
                Pair
            </button>
          </div>
        </div>
      )}

      {gamePhase === 'gameOver' && (
        <div>
          <h2>Game Over!</h2>
          <p>Final Scores:</p>
          <p>Player 1: {player1Score}</p>
          <p>Player 2: {player2Score}</p>
          <h3>{player1Score > player2Score ? 'Player 1 Wins!' : player1Score < player2Score ? "It's a Tie!" : "It's a Tie!"}</h3>
          <button onClick={resetGame}>Play Again</button>
        </div>
      )}
    </div>
  );
}

export default App;

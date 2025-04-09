// scoring.js
export const calculateScores = (player1Pile, player2Pile, player1Score = 0, player2Score = 0) => {
  let p1Score = player1Score;
  let p2Score = player2Score;

  // --- Most cards ---
  if (player1Pile.length > 26 && player2Pile.length <= 26) {
    p1Score += 3;
  } else if (player2Pile.length > 26 && player1Pile.length <= 26) {
    p2Score += 3;
  } // Else if tied (both <= 26 or both > 26), no points awarded

  // --- Most spades ---
  const p1Spades = player1Pile.filter((card) => card.suit === 'S').length;
  const p2Spades = player2Pile.filter((card) => card.suit === 'S').length;
  if (p1Spades > p2Spades) {
    p1Score += 1;
  } else if (p2Spades > p1Spades) {
    p2Score += 1;
  } // Else if tied, no points awarded

  // --- Card points (Aces, Big Casino, Little Casino) ---
  player1Pile.forEach(card => {
    if (card.rank === 'A') p1Score += 1;
    if (card.suitRank === 'D10') p1Score += 2;
    if (card.suitRank === 'S2') p1Score += 1;
  });

  player2Pile.forEach(card => {
    if (card.rank === 'A') p2Score += 1;
    if (card.suitRank === 'D10') p2Score += 2;
    if (card.suitRank === 'S2') p2Score += 1;
  });

  return { p1Score, p2Score };
};

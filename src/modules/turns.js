// src/modules/turns.js
import { validateBuild } from './buildLogic';
import { validatePair } from './pairLogic';
import { getValue, captureValues, combinationValue } from './deck';
import { CaptureValidator, areItemSetsEqual } from './captureLogic';

// Simple ID generator
let nextBuildId = 0;
const generateBuildId = () => `build-${nextBuildId++}`;
let nextPairId = 0;
const generatePairId = () => `pair-${nextPairId++}`;

/**
 * Handles the build action, using the validated summing/cascading groups.
 */
export const handleBuild = (playedCard, selectedItems, currentPlayer, tableItems, playerHand) => {
    const validation = validateBuild(playedCard, selectedItems, playerHand, tableItems, currentPlayer);
    if (!validation.isValid) {
      return { success: false, newTableItems: tableItems, message: validation.message };
    }

    const { buildValue, isModification, targetBuild, summingItems, cascadingItems, isMultiBuildCreation, multiBuildBuilds, isMultiBuildIncrease } = validation;
    let newTableItems = [...tableItems];
    let newBuildObject;

    if (isMultiBuildCreation) {
        newBuildObject = {
            type: 'build',
            id: `multibuild-${Date.now()}`,
            builds: multiBuildBuilds,
            value: buildValue,
            controller: currentPlayer,
            isCompound: true
        };
        // Ensure selectedItems have IDs before filtering
        const selectedIds = selectedItems.filter(item => item && item.id).map(item => item.id);
        newTableItems = newTableItems.filter(
            item => item && item.id && !selectedIds.includes(item.id)
        );
        newTableItems.push(newBuildObject);
        return {
            success: true,
            newTableItems,
            message: `Player ${currentPlayer} created Multi-Build of ${buildValue}.`
        };
    } else if (isMultiBuildIncrease) {
        const newBuild = {
            cards: [playedCard, ...summingItems],
            value: buildValue
        };
        newTableItems = newTableItems.map(item => {
            if (item && item.id === targetBuild.id) {
                // Ensure targetBuild.builds exists and is an array
                const existingBuilds = Array.isArray(targetBuild.builds) ? targetBuild.builds : [];
                return {
                    ...item,
                    builds: [...existingBuilds, newBuild],
                    controller: currentPlayer,
                    isCompound: true // Mark as compound after increasing
                };
            }
            return item;
        });
        // Ensure summingItems have IDs before filtering
        const summingIds = summingItems.filter(item => item && item.id).map(item => item.id);
        newTableItems = newTableItems.filter(
            item => item && item.id && !summingIds.includes(item.id)
        );
        return {
            success: true,
            newTableItems,
            message: `Player ${currentPlayer} increased Multi-Build of ${buildValue}.`
        };
    } else {
        // --- Single Build Creation/Modification ---
        let finalBuildCards = [playedCard];

        // Add cards from summing items (cards or builds)
        summingItems.forEach(item => {
            if (!item) return;
            if (item.type === 'card') finalBuildCards.push(item);
            else if (item.type === 'build' && Array.isArray(item.cards)) finalBuildCards.push(...item.cards);
        });

        // Add cards from cascading items (cards or builds)
        cascadingItems.forEach(item => {
             if (!item) return;
            if (item.type === 'card') finalBuildCards.push(item);
            else if (item.type === 'build' && Array.isArray(item.cards)) finalBuildCards.push(...item.cards);
        });

        // Add cards from the build being modified, excluding those already added
        if (isModification && targetBuild && Array.isArray(targetBuild.cards)) {
            const addedCardSuitRanks = new Set(finalBuildCards.map(c => c.suitRank));
            targetBuild.cards.forEach(card => {
                if (card && card.suitRank && !addedCardSuitRanks.has(card.suitRank)) {
                    finalBuildCards.push(card);
                }
            });
        }

        // Ensure no duplicate cards in the final build
        const uniqueBuildCards = [];
        const seenSuitRanks = new Set();
        finalBuildCards.forEach(card => {
            if (card && card.suitRank && !seenSuitRanks.has(card.suitRank)) {
                uniqueBuildCards.push(card);
                seenSuitRanks.add(card.suitRank);
            }
        });


        newBuildObject = {
            type: 'build',
            id: (isModification && targetBuild) ? targetBuild.id : generateBuildId(), // Reuse ID if modifying
            value: buildValue,
            cards: uniqueBuildCards, // Use unique cards
            controller: currentPlayer,
            isCompound: false // Single builds are not compound
        };

        // Remove selected items and the target build (if modifying) from the table
        const itemsToRemoveIds = new Set(selectedItems.filter(item => item && item.id).map(item => item.id));
        if (isModification && targetBuild && targetBuild.id) {
            itemsToRemoveIds.add(targetBuild.id);
        }

        newTableItems = newTableItems.filter(
            item => item && item.id && !itemsToRemoveIds.has(item.id)
        );
        newTableItems.push(newBuildObject); // Add the new/modified build
        return {
            success: true,
            newTableItems,
            message: `Player ${currentPlayer} ${isModification ? 'modified' : 'built'} ${buildValue}.`
        };
    }
};

/**
 * Handles the pairing action.
 */
export const handlePair = (playedCard, selectedItems, currentPlayer, tableItems, playerHand) => {
    // Basic validation first
    if (!playedCard || !selectedItems || !Array.isArray(selectedItems)) {
        return { success: false, newTableItems: tableItems, message: "Invalid input for pairing." };
    }
     // Ensure all selected items are valid objects with IDs
    if (!selectedItems.every(item => item && item.id)) {
      console.error("Pairing Error: Some selected items are invalid or missing IDs.");
      return { isValid: false, message: "Internal error: Invalid items selected for pair." };
    }

    const validation = validatePair(playedCard, selectedItems, playerHand);
    if (!validation.isValid) {
        return { success: false, newTableItems: tableItems, message: validation.message };
    }
    const { rank } = validation;

    let updatedTableItems = [...tableItems];
    let newPairObject;

    // Check if extending an existing pair (only one item selected, and it's a pair of the correct rank)
    const existingPair = selectedItems.length === 1 && selectedItems[0].type === 'pair' && selectedItems[0].rank === rank ? selectedItems[0] : null;

    if (existingPair) {
        // Ensure existingPair is valid before spreading
        if (!existingPair || !Array.isArray(existingPair.cards)) {
             console.error("Pairing Error: Invalid existing pair object.");
             return { success: false, newTableItems: tableItems, message: "Internal error: Invalid existing pair." };
        }
        // Add the played card to the existing pair
        newPairObject = {
            ...existingPair,
            cards: [...existingPair.cards, playedCard],
            controller: currentPlayer // Update controller
        };
        // Replace the old pair with the updated one
        updatedTableItems = tableItems.map(item => (item && item.id === existingPair.id ? newPairObject : item));
    } else {
        // Creating a new pair
        // Ensure selected items for pairing are only cards
        if (selectedItems.some(item => item.type !== 'card')) {
             return { success: false, newTableItems: tableItems, message: "Can only pair with cards." };
        }
        const itemsToRemoveIds = selectedItems.map(item => item.id);
        const combinedCards = [playedCard, ...selectedItems];
        newPairObject = {
            type: 'pair',
            id: generatePairId(),
            rank: rank,
            cards: combinedCards,
            controller: currentPlayer
        };
        // Filter out removed items and ensure table items are valid
        updatedTableItems = tableItems.filter(item => item && item.id && !itemsToRemoveIds.includes(item.id));
        updatedTableItems.push(newPairObject);
    }

    return {
        success: true,
        newTableItems: updatedTableItems,
        message: `Player ${currentPlayer} paired ${rank}s.`
    };
};


/**
 * Validates if the selected items constitute a valid capture given the played card.
 * Checks if every selected item is part of *at least one* valid capture set
 * generated by CaptureValidator.getValidCaptures.
 */
const isValidMultiCaptureSelection = (playedCard, selectedItems, tableItems) => {
    // Basic checks
    if (!playedCard || !selectedItems || !Array.isArray(selectedItems)) return false;
    if (selectedItems.length === 0) return true; // Empty selection is valid (captures nothing)

    // Ensure all items involved have IDs for reliable comparison
    if (!selectedItems.every(item => item && item.id)) {
        console.error("isValidMultiCaptureSelection Error: Some selected items are missing IDs");
        return false;
    }
    const selectedItemIds = new Set(selectedItems.map(item => item.id));

    // Generate all theoretically possible capture sets with the played card
    const allValidOptions = CaptureValidator.getValidCaptures(playedCard, tableItems);
    if (!allValidOptions || !Array.isArray(allValidOptions)) {
         console.error("isValidMultiCaptureSelection Error: Invalid result from getValidCaptures");
         return false;
    }

    const coveredItemIds = new Set();

    // Iterate through all possible valid capture sets
    for (const option of allValidOptions) {
        // Ensure option is valid and its items have IDs
        if (!option || !Array.isArray(option) || !option.every(item => item && item.id)) {
            console.warn("isValidMultiCaptureSelection: Skipping invalid option from getValidCaptures", option);
            continue;
        }
        const optionIds = option.map(item => item.id);

        // Check if this valid capture set is fully contained within the user's selection
        const isOptionSelected = optionIds.every(id => selectedItemIds.has(id));

        // If this valid set *is* part of the user's selection, mark its items as 'covered'
        if (isOptionSelected) {
            optionIds.forEach(id => coveredItemIds.add(id));
        }
    }

    // The selection is valid IF AND ONLY IF:
    // 1. Every item the user selected is covered by at least one valid capture set.
    // 2. The set of covered items is exactly the same as the set of selected items (no extra items covered).
    return coveredItemIds.size === selectedItemIds.size &&
           [...selectedItemIds].every(id => coveredItemIds.has(id));
};


/**
 * Handles the capture action, allowing for multiple independent captures.
 */
export const handleCapture = (playedCard, selectedItems, currentPlayer,
    player1Score, player2Score, tableItems, lastCapturer) => {

    // Basic validation
    if (!playedCard || !selectedItems || !Array.isArray(selectedItems)) {
         return { success: false, message: "Invalid input for capture.", newP1Score: player1Score, newP2Score: player2Score, newTableItems: tableItems, newLastCapturer: lastCapturer, capturedCards: [] };
    }
    // Ensure selected items have IDs
    if (!selectedItems.every(item => item && item.id)) {
        console.error("Capture Error: Some selected items are missing IDs.");
        return { success: false, message: "Internal error: Invalid items selected.", newP1Score: player1Score, newP2Score: player2Score, newTableItems: tableItems, newLastCapturer: lastCapturer, capturedCards: [] };
    }

    // Use the updated validation logic
    const isSelectionValid = isValidMultiCaptureSelection(playedCard, selectedItems, tableItems);

    if (!isSelectionValid) {
        return {
            success: false,
            newP1Score: player1Score,
            newP2Score: player2Score,
            newTableItems: tableItems,
            newLastCapturer: lastCapturer,
            message: "Invalid capture selection.",
            capturedCards: []
        };
    }

    // Check ownership ONLY for selected Builds and Pairs
    const ownedItemViolation = selectedItems.some(item =>
        (item.type === 'build' || item.type === 'pair') && item.controller !== currentPlayer
    );
    if (ownedItemViolation) {
        return {
            success: false,
            newP1Score: player1Score,
            newP2Score: player2Score,
            newTableItems: tableItems,
            newLastCapturer: lastCapturer,
            message: "Cannot capture Builds or Pairs you don’t control.",
            capturedCards: []
        };
    }

    // --- Capture is Valid ---
    let capturedCards = [playedCard]; // Start with the played card
    let currentP1Score = player1Score;
    let currentP2Score = player2Score;

    // Add cards from the selected items
    selectedItems.forEach(item => {
        if (!item) { console.error("Undefined item in selectedItems during capture processing"); return; }
        if (item.type === 'card') {
            capturedCards.push(item);
        } else if ((item.type === 'build' || item.type === 'pair') && Array.isArray(item.cards)) {
            // Add all cards contained within the build/pair
            capturedCards.push(...item.cards);
        } else if (item.type === 'build' || item.type === 'pair') {
             console.error(`${item.type} item missing cards array:`, item);
        }
    });

    // Ensure captured cards are unique (important if a card was part of multiple captures)
    const uniqueCapturedCards = [];
    const seenCaptureSuitRanks = new Set();
    capturedCards.forEach(card => {
        if (card && card.suitRank && !seenCaptureSuitRanks.has(card.suitRank)) {
            uniqueCapturedCards.push(card);
            seenCaptureSuitRanks.add(card.suitRank);
        }
    });


    // Remove captured items from the table
    const selectedItemIds = selectedItems.map(item => item.id);
    // Filter out null/undefined items before checking IDs
    const validTableItems = tableItems.filter(item => item && item.id);
    const newTableItems = validTableItems.filter(item => !selectedItemIds.includes(item.id));

    // Check for sweep
    let sweepMessage = "";
    // Sweep occurs if the table is cleared AND the table wasn't empty before the capture
    if (newTableItems.length === 0 && validTableItems.length > 0) {
        if (currentPlayer === 1) {
            currentP1Score += 1; // Award sweep point immediately
        } else {
            currentP2Score += 1; // Award sweep point immediately
        }
        sweepMessage = " Sweep!";
    }

    return {
        success: true,
        newP1Score: currentP1Score,
        newP2Score: currentP2Score,
        newTableItems: newTableItems,
        newLastCapturer: currentPlayer, // Update last capturer
        message: `Player ${currentPlayer} captured ${selectedItems.length} item(s).${sweepMessage}`,
        capturedCards: uniqueCapturedCards // Return the unique list of cards
    };
};

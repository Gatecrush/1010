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
        newTableItems = newTableItems.filter(
            item => !selectedItems.some(sel => sel.id === item.id)
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
            if (item.id === targetBuild.id) {
                return {
                    ...item,
                    builds: [...item.builds, newBuild],
                    controller: currentPlayer,
                    isCompound: true
                };
            }
            return item;
        });
        newTableItems = newTableItems.filter(
            item => !summingItems.some(sel => sel.id === item.id)
        );
        return {
            success: true,
            newTableItems,
            message: `Player ${currentPlayer} increased Multi-Build of ${buildValue}.`
        };
    } else {
        let finalBuildCards = [playedCard];
        summingItems.forEach(item => {
            if (item.type === 'card') finalBuildCards.push(item);
            else if (item.type === 'build') finalBuildCards.push(...item.cards);
        });
        cascadingItems.forEach(item => {
            if (item.type === 'card') finalBuildCards.push(item);
            else if (item.type === 'build') finalBuildCards.push(...item.cards);
        });
        if (isModification && targetBuild) {
            finalBuildCards.push(...targetBuild.cards.filter(
                c => !summingItems.some(i => i.id === targetBuild.id) && !cascadingItems.some(i => i.id === targetBuild.id)
            ));
        }

        newBuildObject = {
            type: 'build',
            id: generateBuildId(),
            value: buildValue,
            cards: finalBuildCards,
            controller: currentPlayer,
            isCompound: false
        };

        if (isModification && targetBuild) {
            newBuildObject.id = targetBuild.id;
        }

        newTableItems = newTableItems.filter(
            item => (!targetBuild || item.id !== targetBuild.id) && !selectedItems.some(sel => sel.id === item.id)
        );
        newTableItems.push(newBuildObject);
        return {
            success: true,
            newTableItems,
            message: `Player ${currentPlayer} built ${buildValue}.`
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

    const existingPair = selectedItems.length === 1 && selectedItems[0].type === 'pair' && selectedItems[0].rank === rank ? selectedItems[0] : null;

    if (existingPair) {
        // Ensure existingPair is valid before spreading
        if (!existingPair || !existingPair.cards) {
             console.error("Pairing Error: Invalid existing pair object.");
             return { success: false, newTableItems: tableItems, message: "Internal error: Invalid existing pair." };
        }
        newPairObject = {
            ...existingPair,
            cards: [...existingPair.cards, playedCard],
            controller: currentPlayer
        };
        updatedTableItems = tableItems.map(item => (item.id === existingPair.id ? newPairObject : item));
    } else {
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
 * Checks if the user's selected items can be perfectly partitioned into
 * one or more valid capture sets generated by CaptureValidator.getValidCaptures.
 */
const isValidMultiCaptureSelection = (selectedItems, validCaptureOptions) => {
    // Basic checks
    if (!selectedItems) return false; // Handle null/undefined selection
    if (selectedItems.length === 0) return true; // Empty selection is valid (captures nothing)
    if (!validCaptureOptions || validCaptureOptions.length === 0) return selectedItems.length === 0;

    // Ensure all items involved have IDs for reliable comparison
    if (!selectedItems.every(item => item && item.id)) {
        console.error("isValidMultiCaptureSelection Error: Some selected items are missing IDs");
        return false;
    }
    if (!validCaptureOptions.every(option => option && Array.isArray(option) && option.every(item => item && item.id))) {
         console.error("isValidMultiCaptureSelection Error: Some valid capture options are invalid or contain items missing IDs");
        return false;
    }

    // Use IDs for partitioning check
    let remainingSelectedItemIds = new Set(selectedItems.map(item => item.id));
    let currentOptions = [...validCaptureOptions]; // Copy options

    let progressMade = true;
    while (progressMade && remainingSelectedItemIds.size > 0) {
        progressMade = false;
        let optionUsedIndex = -1;

        for (let i = 0; i < currentOptions.length; i++) {
            const validSet = currentOptions[i];
            // Ensure validSet is an array before mapping
             if (!Array.isArray(validSet)) {
                 console.error("isValidMultiCaptureSelection Error: Option is not an array", validSet);
                 continue; // Skip invalid option
             }
            const validSetIds = validSet.map(item => item.id);
            const canUseSet = validSetIds.length > 0 && validSetIds.every(id => remainingSelectedItemIds.has(id));

            if (canUseSet) {
                validSetIds.forEach(id => remainingSelectedItemIds.delete(id));
                progressMade = true;
                optionUsedIndex = i;
                break;
            }
        }

        if (optionUsedIndex !== -1) {
            currentOptions.splice(optionUsedIndex, 1);
        } else if (remainingSelectedItemIds.size > 0) {
             return false; // No progress made, but items remain
        }
    }
    return remainingSelectedItemIds.size === 0;
};


/**
 * Handles the capture action, allowing for multiple independent captures.
 */
export const handleCapture = (playedCard, selectedItems, currentPlayer,
    player1Score, player2Score, tableItems, lastCapturer) => {

    // Basic validation
    if (!playedCard || !selectedItems || !Array.isArray(selectedItems)) {
         return { success: false, message: "Invalid input for capture.", /* other state */ };
    }

    const allValidOptions = CaptureValidator.getValidCaptures(playedCard, tableItems);
    let isSelectionValid = isValidMultiCaptureSelection(selectedItems, allValidOptions);

    // Fallback check for exact match if partitioning fails
    if (!isSelectionValid && selectedItems.length > 0) {
        for (const option of allValidOptions) {
            if (areItemSetsEqual(selectedItems, option)) {
                isSelectionValid = true;
                break;
            }
        }
    }

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

    // Check ownership for Builds
    if (selectedItems.some(item => item.type === 'build' && item.controller !== currentPlayer)) {
        return {
            success: false,
            newP1Score: player1Score,
            newP2Score: player2Score,
            newTableItems: tableItems,
            newLastCapturer: lastCapturer,
            message: "Cannot capture Builds you don’t control.",
            capturedCards: []
        };
    }

    let capturedCards = [playedCard];
    let currentP1Score = player1Score;
    let currentP2Score = player2Score;

    selectedItems.forEach(item => {
        if (!item) { console.error("Undefined item in selectedItems during capture processing"); return; }
        if (item.type === 'card') { capturedCards.push(item); }
        else if (item.type === 'build') {
             if (item.cards && Array.isArray(item.cards)) {
                 capturedCards.push(...item.cards);
             } else {
                 console.error("Build item missing cards array:", item);
             }
        }
    });

    // Remove captured items from the table
     if (!selectedItems.every(item => item && item.id)) {
        console.error("Cannot remove items - selection contains items without IDs");
        return {
            success: false,
            message: "Internal error: Selected items missing IDs.",
            newP1Score: player1Score,
            newP2Score: player2Score,
            newTableItems: tableItems,
            newLastCapturer: lastCapturer,
            capturedCards: []
        };
    }
    const selectedItemIds = selectedItems.map(item => item.id);
    const validTableItems = tableItems.filter(item => item && item.id);
    const newTableItems = validTableItems.filter(item => !selectedItemIds.includes(item.id));

    // Check for sweep
    let sweepMessage = "";
    // Sweep occurs if the table is cleared AND the table wasn't empty before the capture
    if (newTableItems.length === 0 && validTableItems.length > 0) {
        if (currentPlayer === 1) {
            player1Score += 1;
        } else {
            player2Score += 1;
        }
        sweepMessage = " Sweep!";
    }

    return {
        success: true,
        newP1Score: currentP1Score,
        newP2Score: currentP2Score,
        newTableItems: newTableItems,
        newLastCapturer: currentPlayer,
        message: `Player ${currentPlayer} captured ${selectedItems.length} item(s).${sweepMessage}`,
        capturedCards: capturedCards
    };
};

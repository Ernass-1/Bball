function evaluateOffers(save, offers) {
    if (!offers || offers.length === 0) return null;

    // Scoring logic:
    // We calculate a score based on:
    // 1. Total Contract Value (amount_per_year * years) - Primary driver.
    // 2. Team Strength (win percentage) - Secondary driver.
    // Formula: Score = TotalValue * (1 + WinPercentage)
    // This assumes that players prefer more money, and among similar offers,
    // they prefer teams with a higher winning percentage.
    // If win percentage is unavailable, we default to 0.5 (neutral).

    let bestOffer = null;
    let highestScore = -1;

    for (const offer of offers) {
        const totalValue = offer.amount_per_year * offer.years;
        const team = save.teams ? save.teams.find(t => t.tid === offer.team_id) : null;
        const winPercentage = team && typeof team.winp === 'number' ? team.winp : 0.5;

        const score = totalValue * (1 + winPercentage);

        if (score > highestScore) {
            highestScore = score;
            bestOffer = offer;
        }
    }

    return bestOffer;
}

module.exports = { evaluateOffers };

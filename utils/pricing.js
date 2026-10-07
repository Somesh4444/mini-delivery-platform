// Pricing formula: Base Fare + (Distance * Rate/km) + (Weight * Rate/kg)
function calculateDeliveryPrice(distanceKm, parcelWeightKg) {
  const BASE_FARE = 50;       // Base starting fee (currency units)
  const RATE_PER_KM = 12;     // 12 per km
  const RATE_PER_KG = 5;      // 5 per kg

  const distanceCost = distanceKm * RATE_PER_KM;
  const weightCost = parcelWeightKg * RATE_PER_KG;
  const total = BASE_FARE + distanceCost + weightCost;

  return Math.round(total * 100) / 100; // Round to 2 decimal places
}

module.exports = { calculateDeliveryPrice };
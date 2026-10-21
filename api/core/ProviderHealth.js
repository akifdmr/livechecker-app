const config = require('../config');

class ProviderHealth {
  constructor(key, providerConfig) {
    this.key = key;
    this.name = providerConfig.name;
    this.basePriority = providerConfig.basePriority || 1;
    this.enabled = providerConfig.enabled || false;

    this.consecutiveErrors = 0;
    this.disabledUntil = 0;
    this.lastError = null;

    this.totalRequests = 0;
    this.approvedCount = 0;
    this.declinedCount = 0;
    this.errorCount = 0;
    this.networkErrorCount = 0;

    this.recentOutcomes = [];
    this.weight = this.basePriority;
  }

  recordSuccess(duration, approved) {
    this.totalRequests++;
    if (approved) this.approvedCount++;
    else this.declinedCount++;
    this.consecutiveErrors = 0;

    this.recentOutcomes.push({
      success: true,
      duration,
      timestamp: Date.now(),
    });

    if (this.recentOutcomes.length > config.HEALTH_WINDOW_SIZE) {
      this.recentOutcomes.shift();
    }
  }

  recordError(errorMsg, duration, isNetwork = false) {
    this.totalRequests++;
    this.errorCount++;
    if (isNetwork) this.networkErrorCount++;
    this.consecutiveErrors++;
    this.lastError = errorMsg;

    this.recentOutcomes.push({
      success: false,
      duration,
      timestamp: Date.now(),
    });

    if (this.recentOutcomes.length > config.HEALTH_WINDOW_SIZE) {
      this.recentOutcomes.shift();
    }

    if (this.consecutiveErrors >= config.CIRCUIT_BREAKER_THRESHOLD) {
      this.disabledUntil = Date.now() + config.CIRCUIT_BREAKER_TIMEOUT;
    }
  }

  getHealthScore() {
    if (this.recentOutcomes.length === 0) return 100;
    const recent = this.recentOutcomes;
    const successRate = recent.filter((o) => o.success).length / recent.length;
    const avgDuration = recent.reduce((s, o) => s + o.duration, 0) / recent.length;
    const durationScore = Math.max(0, 1 - avgDuration / 10000);
    const penalty = this.consecutiveErrors * 0.1;
    const score = successRate * 70 + durationScore * 30 - penalty * 100;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  getSuccessRate() {
    if (this.recentOutcomes.length === 0) return 1;
    return (
      this.recentOutcomes.filter((o) => o.success).length /
      this.recentOutcomes.length
    );
  }

  getAvgDuration() {
    if (this.recentOutcomes.length === 0) return 0;
    return (
      this.recentOutcomes.reduce((s, o) => s + o.duration, 0) /
      this.recentOutcomes.length
    );
  }

  calculateWeight() {
    if (!this.enabled || Date.now() < this.disabledUntil) {
      this.weight = 0;
      return;
    }
    const health = this.getHealthScore();
    const successRate = this.getSuccessRate();
    const avgDuration = this.getAvgDuration();

    let weight = (this.basePriority * health) / 100;
    if (successRate < 1 - config.ERROR_THRESHOLD) weight = 0;
    if (avgDuration > 8000) weight *= 0.5;
    if (this.totalRequests < 5) weight = Math.max(weight, this.basePriority);

    this.weight = Math.max(
      config.MIN_WEIGHT,
      Math.min(config.MAX_WEIGHT, Math.round(weight * 10) / 10)
    );
  }

  isAvailable() {
    return (
      this.enabled &&
      Date.now() >= this.disabledUntil &&
      this.weight > 0
    );
  }

getStats() {
  return {
    name: this.name,
    enabled: this.enabled,
    available: this.isAvailable(),
    weight: this.weight || 0,
    healthScore: this.getHealthScore() || 100,
    successRate: Math.round((this.getSuccessRate() || 0) * 100) / 100,
    avgDuration: Math.round(this.getAvgDuration() || 0),
    totalRequests: this.totalRequests || 0,
    approvedCount: this.approvedCount || 0,
    declinedCount: this.declinedCount || 0,
    errorCount: this.errorCount || 0,
    networkErrorCount: this.networkErrorCount || 0,
    consecutiveErrors: this.consecutiveErrors || 0,
    disabledFor: this.disabledUntil > Date.now()
      ? Math.round((this.disabledUntil - Date.now()) / 1000) + 's'
      : '0s',
    lastError: this.lastError || null,
  };
}
}

module.exports = ProviderHealth;
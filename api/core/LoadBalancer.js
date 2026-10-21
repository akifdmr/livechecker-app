class LoadBalancer {
  constructor(healths) {
    // healths: { providerKey: ProviderHealth }
    this.healths = healths;
    this.rotationIndex = 0;
    this.isDev = false;
    this.appEnv = 'production';
  }

  /**
   * Ortam bilgisini set et — app.js'ten çağrılır
   */
  setEnvironment({ isDev, appEnv }) {
    this.isDev = isDev;
    this.appEnv = appEnv || 'production';
    console.log(`[LB] Ortam: ${this.appEnv} (dev: ${this.isDev})`);
  }

  /**
   * Weighted rotation oluştur
   */
  buildRotation() {
    const available = Object.entries(this.healths)
      .filter(([key, h]) => {
        if (!h.isAvailable()) return false;

        // DEV modunda Braintree'yi rotation'dan çıkar
        if (this.isDev && h.type === 'braintree') return false;

        return true;
      })
      .sort(([, a], [, b]) => (b.weight || 0) - (a.weight || 0));

    if (available.length === 0) return [];

    const rotation = [];
    for (const [key, h] of available) {
      const slots = Math.max(1, Math.round(h.weight || 1));
      for (let i = 0; i < slots; i++) rotation.push(key);
    }
    return rotation;
  }

  selectProvider() {
    const rotation = this.buildRotation();
    if (rotation.length === 0) {
      console.warn('[LB] Rotation boş — tüm providerlar müsait değil');
      return null;
    }
    const idx = this.rotationIndex % rotation.length;
    this.rotationIndex++;
    return rotation[idx];
  }

  /**
   * Fallback listesi — tried hariç, weight'e göre sıralı
   * @param {string[]} tried - Denenmiş provider key'leri
   * @param {boolean} isDev - DEV modunda Braintree'yi atla
   */
  getFallbacks(tried = [], isDev = false) {
    const useDev = isDev || this.isDev;

    return Object.entries(this.healths)
      .filter(([key, h]) => {
        if (tried.includes(key)) return false;
        if (!h.isAvailable()) return false;

        // DEV modunda Braintree'yi atla
        if (useDev && h.type === 'braintree') return false;

        return true;
      })
      .sort(([, a], [, b]) => (b.weight || 0) - (a.weight || 0))
      .map(([key]) => key);
  }

  recalculateWeights() {
    for (const h of Object.values(this.healths)) {
      if (typeof h.calculateWeight === 'function') h.calculateWeight();
    }
    console.log(
      '[LB] Ağırlıklar:',
      Object.fromEntries(
        Object.entries(this.healths).map(([k, h]) => [k, h.weight || 0])
      )
    );
  }

  getStats() {
    const stats = {};
    for (const [key, h] of Object.entries(this.healths)) {
      stats[key] = typeof h.getStats === 'function' ? h.getStats() : { weight: h.weight };
    }
    return stats;
  }
}

module.exports = LoadBalancer;
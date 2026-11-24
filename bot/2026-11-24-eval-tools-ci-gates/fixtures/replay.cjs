module.exports = class OfflineReplay {
  id() {
    return 'offline-fixture';
  }

  async callApi(prompt) {
    if (prompt === 'error') return { error: 'Frozen provider error' };
    return { output: prompt };
  }
};

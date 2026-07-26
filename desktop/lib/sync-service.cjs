class SyncService {
  constructor(database, authService) {
    this.database = database;
    this.authService = authService;
  }

  queueDraft(draftId) {
    return this.database.queueDraft(draftId);
  }

  async runPending() {
    const settings = this.database.getPublicSettings();
    if (!settings.apiBaseUrl) {
      return {
        ok: false,
        code: "API_NOT_CONFIGURED",
        message: "Configure the Apps Script API URL before publishing.",
        queue: this.database.listSyncQueue(),
      };
    }
    let accessToken;
    try {
      accessToken = await this.authService.accessToken();
    } catch {
      return {
        ok: false,
        code: "AUTH_REQUIRED",
        message: "Google authentication is required before publishing.",
        queue: this.database.listSyncQueue(),
      };
    }

    const results = [];
    for (const job of this.database.pendingSyncJobs()) {
      this.database.markSyncPosting(job.sync_job_id);
      try {
        const requestPayload = JSON.parse(job.request_json);
        requestPayload.auth = { accessToken };
        const response = await fetch(settings.apiBaseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain;charset=utf-8",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(requestPayload),
          redirect: "follow",
        });
        const payload = await response.json();
        if (!payload.ok) {
          if (payload.error?.code === "VERSION_CONFLICT") {
            this.database.markSyncConflict(job.sync_job_id, payload.error);
          } else {
            this.database.markSyncFailed(
              job.sync_job_id,
              payload.error?.code || "API_ERROR",
              payload.error?.message || "Publish failed.",
            );
          }
          results.push({ jobId: job.sync_job_id, ok: false, error: payload.error });
          continue;
        }
        this.database.markSyncComplete(job.sync_job_id, payload.data);
        results.push({ jobId: job.sync_job_id, ok: true, data: payload.data });
      } catch (error) {
        this.database.markSyncFailed(job.sync_job_id, "NETWORK_ERROR", error.message);
        results.push({
          jobId: job.sync_job_id,
          ok: false,
          error: { code: "NETWORK_ERROR", message: error.message },
        });
      }
    }

    return { ok: results.every((item) => item.ok), results, queue: this.database.listSyncQueue() };
  }
}

module.exports = { SyncService };

export class MemoryStore {
  constructor(initialState = {}) {
    this.runs = initialState.runs ?? [];
    this.products = initialState.products ?? {};
    this.videos = initialState.videos ?? {};
    this.publishEvents = initialState.publishEvents ?? [];
    this.lastSuccessfulRunAt = initialState.lastSuccessfulRunAt ?? null;
  }

  processedProductIds() {
    return Object.keys(this.products).filter((productId) => this.products[productId].processed);
  }

  markProductProcessed(product) {
    this.products[product.productId] = {
      ...product,
      processed: true,
      processedAt: new Date().toISOString()
    };
  }

  saveVideo(video) {
    this.videos[video.videoId] = video;
  }

  pendingVideos() {
    return Object.values(this.videos).filter((video) => video.status === "pending_confirmation");
  }

  confirmedVideos() {
    return Object.values(this.videos).filter((video) => video.status === "confirmed");
  }

  markVideoConfirmed(videoId) {
    const video = this.videos[videoId];
    if (!video) {
      throw new Error(`Video "${videoId}" not found`);
    }
    video.status = "confirmed";
    video.confirmedAt = new Date().toISOString();
  }

  markVideoPublished(videoId, event) {
    const video = this.videos[videoId];
    if (!video) {
      throw new Error(`Video "${videoId}" not found`);
    }
    video.status = "published";
    video.publishedAt = new Date().toISOString();
    this.publishEvents.push({ videoId, ...event });
  }

  recordRun(run) {
    this.runs.push(run);
    if (run.status === "success") {
      this.lastSuccessfulRunAt = run.finishedAt;
    }
  }

  toJSON() {
    return {
      runs: this.runs,
      products: this.products,
      videos: this.videos,
      publishEvents: this.publishEvents,
      lastSuccessfulRunAt: this.lastSuccessfulRunAt
    };
  }
}

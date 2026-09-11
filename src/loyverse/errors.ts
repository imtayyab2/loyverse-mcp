/** Error raised for any non-2xx response from the Loyverse API. */
export class LoyverseApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "LoyverseApiError";
  }

  /**
   * A sentence the model can act on, rather than a bare status code. The
   * Loyverse API overloads a few statuses in ways that are easy to misread.
   */
  get guidance(): string {
    switch (this.status) {
      case 401:
        return "The access token was rejected. Check LOYVERSE_ACCESS_TOKEN is a current token from the Loyverse back office under Settings > Access tokens.";
      case 402:
        return "This account cannot read data this old. Loyverse serves only the last 31 days of sales history without the Unlimited Sales History add-on.";
      case 403:
        return "The token is valid but lacks permission for this resource.";
      case 404:
        return "No such record. Check the id, and note that deleted records are hidden unless show_deleted is true.";
      case 429:
        return "Rate limited. Loyverse allows 300 requests per 300 seconds; the client already retried with backoff.";
      default:
        return this.status >= 500
          ? "Loyverse returned a server error. This is usually transient."
          : "The request was rejected. Check the field names and values against the Loyverse API reference.";
    }
  }
}

/** Error raised when the server is misconfigured, before any request is made. */
export class LoyverseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoyverseConfigError";
  }
}

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { issueConfirmToken, useConfirmToken, _resetConfirmStore } from "./confirm.js";

describe("two-phase confirmation tokens", () => {
  beforeEach(() => _resetConfirmStore());
  afterEach(() => vi.useRealTimers());

  it("a fresh token validates for the same fingerprint", () => {
    const token = issueConfirmToken("send_campaign:42");
    expect(useConfirmToken(token, "send_campaign:42")).toEqual({ ok: true });
  });

  it("is one-time — a second use fails", () => {
    const token = issueConfirmToken("delete_member:a@b.com");
    expect(useConfirmToken(token, "delete_member:a@b.com").ok).toBe(true);
    const second = useConfirmToken(token, "delete_member:a@b.com");
    expect(second.ok).toBe(false);
    expect(second.reason).toMatch(/already-used|unknown/);
  });

  it("rejects a token used against a DIFFERENT action (no replay across targets)", () => {
    const token = issueConfirmToken("send_campaign:42");
    const res = useConfirmToken(token, "send_campaign:99");
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/does not match/);
  });

  it("burns the token even on a mismatched attempt (no brute force)", () => {
    const token = issueConfirmToken("delete_member:a@b.com");
    useConfirmToken(token, "delete_member:WRONG"); // wrong → burned
    expect(useConfirmToken(token, "delete_member:a@b.com").ok).toBe(false);
  });

  it("rejects an unknown token", () => {
    expect(useConfirmToken("nope", "x").ok).toBe(false);
  });

  it("expires after 5 minutes", () => {
    vi.useFakeTimers();
    const token = issueConfirmToken("send_campaign:1");
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    const res = useConfirmToken(token, "send_campaign:1");
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/expired/);
  });

  it("issues distinct tokens", () => {
    expect(issueConfirmToken("x")).not.toBe(issueConfirmToken("x"));
  });
});

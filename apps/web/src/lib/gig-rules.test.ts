import { describe, expect, test } from "bun:test";
import { addDays, localDateTime } from "@coverband/shared";
import {
  deviceTimeZone,
  directionsUrl,
  formatPay,
  gigRights,
  homeGigs,
  parsePay,
  payText,
} from "./gig-rules";

const today = localDateTime(new Date(), deviceTimeZone()).date;
const creator = { userId: "u1", isLeader: false };
const other = { userId: "u2", isLeader: false };
const leader = { userId: "u3", isLeader: true };
const gig = (status: string, days = 10) => ({
  status,
  date: addDays(today, days),
  createdById: "u1",
});

describe("gigRights", () => {
  test("any member edits; its creator or a band leader settles, cancels, deletes", () => {
    expect(gigRights(gig("proposed"), other)).toMatchObject({
      edit: true,
      settle: false,
      cancel: false,
      delete: false,
    });
    for (const member of [creator, leader]) {
      expect(gigRights(gig("proposed"), member)).toMatchObject({
        settle: true,
        postpone: false,
        cancel: true,
        delete: true,
      });
    }
  });
  test("a settled gig is postponed, and cancelled before it is deleted", () => {
    expect(gigRights(gig("settled"), creator)).toMatchObject({
      settle: false,
      postpone: true,
      cancel: true,
      delete: false,
    });
  });
  test("cancelled: read-only, deleted", () => {
    expect(gigRights(gig("cancelled"), creator)).toMatchObject({
      edit: false,
      postpone: false,
      cancel: false,
      delete: true,
    });
  });
  test("past: read-only but delete, even settled", () => {
    expect(gigRights(gig("settled", -3), creator)).toMatchObject({
      past: true,
      edit: false,
      postpone: false,
      cancel: false,
      delete: true,
    });
    expect(gigRights(gig("settled", -3), other).delete).toBe(false);
  });
});

describe("directionsUrl", () => {
  const venue = { name: "Le Ty Anna", address: "19 place Sainte-Anne", city: "Rennes" };
  test("Apple Maps on an iPhone, Google Maps elsewhere, from the address", () => {
    expect(directionsUrl(venue, true)).toBe(
      "https://maps.apple.com/?daddr=19%20place%20Sainte-Anne%2C%20Rennes",
    );
    expect(directionsUrl({ ...venue, address: null }, false)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Le%20Ty%20Anna%2C%20Rennes",
    );
  });
});

describe("pay", () => {
  test("typed in euros, kept in cents", () => {
    expect(parsePay("")).toBeNull();
    expect(parsePay("400")).toBe(40000);
    expect(parsePay("400,5")).toBe(40050);
    expect(parsePay("1 200.25 €")).toBe(120025);
    expect(parsePay("abc")).toBeUndefined();
    expect(parsePay("12.345")).toBeUndefined();
    expect(payText(40050)).toBe("400.50");
    expect(payText(40000)).toBe("400");
  });
  test("shown in the language's way", () => {
    expect(formatPay(40000, "en")).toBe("€400");
    expect(formatPay(40050, "fr")).toBe("400,50 €");
  });
});

describe("homeGigs", () => {
  /** A local wall-clock time in the device's (the test's) time zone. */
  const at = (date: string, time: string) => new Date(`${date}T${time}`);
  const yesterday = addDays(today, -1);
  const gigs = [
    { id: "yesterday", date: yesterday, status: "settled" },
    { id: "today", date: today, status: "proposed" },
    { id: "cancelled", date: today, status: "cancelled" },
    ...Array.from({ length: 7 }, (_, i) => ({
      id: `in-${i + 1}`,
      date: addDays(today, 7 - i),
      status: "proposed",
    })),
  ];

  test("yesterday's gig is still today's at 5:59, not at 6:00; cancelled ones left out", () => {
    expect(homeGigs(gigs, at(today, "05:59:00")).today.map((g) => g.id)).toEqual([
      "yesterday",
      "today",
    ]);
    expect(homeGigs(gigs, at(today, "06:00:00")).today.map((g) => g.id)).toEqual(["today"]);
  });

  test("up to 5 upcoming gigs, the soonest first, with how many in all", () => {
    const home = homeGigs(gigs, at(today, "12:00:00"));
    expect(home.upcoming.map((g) => g.id)).toEqual(["in-7", "in-6", "in-5", "in-4", "in-3"]);
    expect(home.upcomingCount).toBe(7);
    expect(home.toCome).toBe(8);
  });
});

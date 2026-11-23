import { describe, expect, test } from "bun:test";
import { addDays, localDateTime } from "@coverband/shared";
import { deviceTimeZone, directionsUrl, gigRights } from "./gig-rules";

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

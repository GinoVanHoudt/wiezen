import { bidLabel } from './bids.js';
import { Bid, Contract, GameError, PlayState, SEATS, Seat } from './types.js';

/**
 * Standard zero-sum point table (RULES.md §4.2).
 * Returns the per-opponent settlement amount for a contract result:
 * positive = the declarer side receives, negative = pays.
 */
export function settlementAmount(bid: Bid, tricksTaken: number): number {
  switch (bid.kind) {
    case 'samen':
    case 'troel': {
      const target = bid.kind === 'troel' ? 8 : bid.tricks!;
      if (bid.kind === 'troel') {
        if (tricksTaken === 13) return 30;
        return tricksTaken >= target ? 16 : -16;
      }
      const base: Record<number, number> = { 8: 8, 9: 11, 10: 14, 11: 17, 12: 20, 13: 30 };
      if (tricksTaken >= target) {
        if (tricksTaken === 13) return 30;
        return base[target]! + 3 * (tricksTaken - target);
      }
      return -(base[target]! + 3 * (target - tricksTaken));
    }
    case 'alleen': {
      const base: Record<number, number> = { 5: 3, 6: 4, 7: 5, 8: 7 };
      const target = bid.tricks!;
      if (tricksTaken >= target) return base[target]! + (tricksTaken - target);
      return -(base[target]! + (target - tricksTaken));
    }
    case 'kleineMiserie':
      return tricksTaken === 0 ? 6 : -6;
    case 'groteMiserie':
      return tricksTaken === 0 ? 12 : -12;
    case 'openMiserie':
      return tricksTaken === 0 ? 24 : -24;
    case 'piccolo':
      return tricksTaken === 1 ? 8 : -8;
    case 'abondance': {
      const base: Record<number, number> = { 9: 10, 10: 15, 11: 20, 12: 30 };
      return tricksTaken >= bid.tricks! ? base[bid.tricks!]! : -base[bid.tricks!]!;
    }
    case 'soloSlim':
      return tricksTaken === 13 ? 60 : -60;
    default:
      throw new GameError(`cannot score bid ${JSON.stringify(bid)}`);
  }
}

/** Tricks needed for troel depend on a possible trump switch; read from the contract. */
function troelAmount(contract: Contract, tricksTaken: number): number {
  if (tricksTaken === 13) return 30;
  return tricksTaken >= contract.tricksNeeded ? 16 : -16;
}

/**
 * Score a completed hand. Returns four deltas summing to zero.
 * Pair contracts: each winner +S, each loser -S.
 * Solo contracts: declarer ±3S, each opponent ∓S.
 * Multiple negative co-declarers: each settled independently against the other three.
 */
export function scoreHand(contract: Contract, play: PlayState, multiplier = 1): { deltas: number[]; summary: string } {
  const deltas = [0, 0, 0, 0];
  const bid = contract.bid;
  const parts: string[] = [];

  if (bid.kind === 'samen' || bid.kind === 'troel') {
    const tricks = contract.declarers.reduce((sum: number, s) => sum + play.tricksWon[s]!, 0);
    const amount =
      bid.kind === 'troel'
        ? troelAmount(contract, tricks)
        : settlementAmount(bid, tricks);
    for (const s of SEATS) {
      deltas[s] = contract.declarers.includes(s) ? amount : -amount;
    }
    parts.push(`${bidLabel(bid)}: ${tricks} tricks, ${amount >= 0 ? 'made' : 'down'} (${amount >= 0 ? '+' : ''}${amount} each)`);
  } else {
    // One or more lone declarers, each settled independently against the table.
    for (const d of contract.declarers) {
      const tricks = play.tricksWon[d]!;
      const amount = settlementAmount(bid, tricks);
      for (const s of SEATS) {
        if (s === d) deltas[s]! += 3 * amount;
        else deltas[s]! -= amount;
      }
      parts.push(`seat ${d} ${bidLabel(bid)}: ${tricks} tricks, ${amount >= 0 ? 'made' : 'down'} (${amount >= 0 ? '+' : ''}${3 * amount})`);
    }
  }

  const result = deltas.map((d) => d * multiplier);
  const sum = result.reduce((x, y) => x + y, 0);
  if (sum !== 0) throw new GameError(`scoring bug: deltas sum to ${sum}`);
  return { deltas: result, summary: parts.join('; ') + (multiplier > 1 ? ` [x${multiplier}]` : '') };
}

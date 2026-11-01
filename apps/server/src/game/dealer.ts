import { Injectable } from '@nestjs/common';
import { type CardId, createDeck, dealCards, shuffleDeck } from '@tienlen/shared';

/**
 * Deals each match with the platform CSPRNG. A separate provider so tests can substitute
 * known deals; production code never does.
 */
@Injectable()
export class Dealer {
  /** 13 cards each for 2–4 players; with fewer than four, the rest of the deck is not used. */
  deal(players: number): CardId[][] {
    return dealCards(shuffleDeck(createDeck()), players);
  }
}

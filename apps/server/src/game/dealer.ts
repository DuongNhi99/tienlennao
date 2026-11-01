import { Injectable } from '@nestjs/common';
import { type CardId, createDeck, dealCards, shuffleDeck } from '@tienlen/shared';

/**
 * Deals each match with the platform CSPRNG. A separate provider so tests can substitute
 * known deals; production code never does.
 */
@Injectable()
export class Dealer {
  deal(): CardId[][] {
    return dealCards(shuffleDeck(createDeck()));
  }
}

import { Injectable, signal } from '@angular/core';
import { Action, Bid, Suit } from '@wiezen/engine';

export type Lang = 'nl' | 'en';

export const LANGS: readonly Lang[] = ['nl', 'en'];

/** Short code shown in the (unobtrusive) language selector. */
export const LANG_CODE: Record<Lang, string> = { nl: 'NL', en: 'EN' };

const STORAGE_KEY = 'wiezen-lang';

type Dict = Record<string, string>;

/**
 * Flat translation dictionaries. Keys are dotted for grouping only.
 * Placeholders use `{name}` syntax and are filled by `I18n.t`.
 * Dutch is the source language; English mirrors it key-for-key.
 */
const NL: Dict = {
  // Home
  'home.subtitle': 'Kleurenwiezen online — met vrienden of tegen botten',
  'home.nameLabel': 'Jouw naam',
  'home.namePlaceholder': 'bv. Gino',
  'home.newTable': 'Nieuwe tafel',
  'home.codePlaceholder': 'CODE',
  'home.join': 'Meedoen',

  // Lobby
  'lobby.table': 'Tafel',
  'lobby.shareHint': 'Deel deze code (of de link) met je medespelers.',
  'lobby.copied': '✓ Link gekopieerd!',
  'lobby.copyLink': '🔗 Kopieer uitnodigingslink',
  'lobby.copyPrompt': 'Kopieer deze link:',
  'lobby.tagBot': 'bot',
  'lobby.tagHost': 'host',
  'lobby.emptySeat': 'vrije stoel',
  'lobby.namePlaceholder': 'Jouw naam',
  'lobby.sit': 'Aan tafel',
  'lobby.addBot': '+ Bot toevoegen',
  'lobby.start': 'Start het spel',
  'lobby.waitingHost': 'Wachten tot de host het spel start…',

  // Table shell
  'table.loading': 'Tafel laden…',
  'table.notFound': 'Tafel niet gevonden',
  'table.notSeated': 'Dit spel is al bezig — je zit niet aan deze tafel.',

  // Board — generic
  'board.loadingCards': 'Kaarten laden…',
  'board.noTrump': 'zonder troef',
  'board.dealer': 'deler',
  'board.tricks': '{n} slagen',
  'board.trickWord': 'slagen',
  'board.trumpWord': 'troef',
  'board.discardPrompt': 'Kies één kaart om weg te leggen (kleine miserie)',
  'board.handPlayed': 'Spel {n} gespeeld',
  'board.nextHand': 'Volgend spel',
  'board.playerFallback': 'speler {n}',
  'board.waiting': '{name} is aan zet…',

  // Board — status line
  'board.status.bidding': 'Bieden',
  'board.status.biddingDouble': 'Bieden (dubbele punten!)',
  'board.status.troelTrump': 'Troel: partner kiest troef',
  'board.status.discard': 'Kleine miserie: iedereen legt een kaart weg',

  // Board — scored summary
  'board.result.made': 'gehaald',
  'board.result.down': 'niet gehaald',

  // Common
  'common.error': 'Er ging iets mis',

  // Suits (spoken names)
  'suit.H': 'harten',
  'suit.D': 'koeken',
  'suit.C': 'klaveren',
  'suit.S': 'schoppen',

  // Bidding action groups
  'group.doorgeven': 'Doorgeven',
  'group.troef': 'Troef kiezen',
  'group.samen': 'Samen',
  'group.alleen': 'Alleen',
  'group.miserie': 'Miserie',
  'group.abondance': 'Abondance',
  'group.soloslim': 'Solo slim',

  // Bid / action labels
  'bid.pass': 'Pas',
  'bid.wachten': 'Wachten',
  'bid.vraag': 'Vraag',
  'bid.meegaan': 'Meegaan',
  'bid.meegaanFor': 'Meegaan voor {n}',
  'bid.alleen': 'Alleen',
  'bid.abondance': 'Abondance',
  'bid.miserieKlein': 'Kleine miserie',
  'bid.miserieGroot': 'Grote miserie',
  'bid.miserieOpen': 'Open miserie',
  'bid.miserieKleinShort': 'Kleine',
  'bid.miserieGrootShort': 'Grote',
  'bid.miserieOpenShort': 'Open',
  'bid.piccolo': 'Piccolo',
  'bid.soloSlim': 'Solo slim',
  'bid.raise': 'Verhogen',
  'bid.parole': 'Passe parole',
  'bid.troelKeep': 'Troef houden',
  'bid.troefShort': 'Troef',
  'bid.troefSwitchSuffix': '(9 slagen)',
  'bid.discard': 'Leg weg',
  'bid.play': 'Speel',

  // Contract banner (kind only; suit shown separately)
  'contract.samen': 'Samen {n}',
  'contract.alleen': 'Alleen {n}',
  'contract.kleineMiserie': 'Kleine miserie',
  'contract.piccolo': 'Piccolo',
  'contract.troel': 'Troel',
  'contract.abondance': 'Abondance {n}',
  'contract.groteMiserie': 'Grote miserie',
  'contract.openMiserie': 'Open miserie',
  'contract.soloSlim': 'Solo slim',

  // Contract explanations (hover tooltips)
  'explain.wachten':
    'Wachten: je bewaart het recht om straks een vraag te aanvaarden in plaats van nu zelf te bieden.',
  'explain.parole':
    'Passe parole: je geeft de beslissing om te verhogen terug aan de vrager (enkel vanaf 11 slagen).',
  'explain.raise': 'Verhogen: je belooft één slag meer om boven een tussenliggend bod te blijven.',
  'explain.troelKeep':
    'Troel: je houdt de opgelegde troef; samen met je partner moet je 8 slagen halen.',
  'explain.troelSwitch':
    'Troel: je kiest zelf een andere troef; dan moeten jullie samen 9 slagen halen.',
  'explain.alleen':
    'Alleen: je speelt in je eentje tegen de andere drie en moet {n} slagen halen met je eigen troef.',
  'explain.abondance':
    'Abondance: alleen tegen de andere drie beloof je {n} slagen met je eigen troef. Jij komt uit.',
  'explain.soloSlim':
    'Solo slim: alleen tegen de andere drie beloof je álle 13 slagen met je eigen troef. Jij komt uit.',
  'explain.piccolo': 'Piccolo: je moet precies één slag halen, zonder troef.',
  'explain.miserieKlein':
    'Kleine miserie: je mag geen enkele slag halen. Iedereen legt eerst één kaart weg; zonder troef.',
  'explain.miserieGroot': 'Grote miserie: je mag geen enkele van de 13 slagen halen, zonder troef.',
  'explain.miserieOpen':
    'Open miserie: je mag geen enkele slag halen en speelt met je kaarten open op tafel, zonder troef.',
};

const EN: Dict = {
  // Home
  'home.subtitle': 'Colour whist online — with friends or against bots',
  'home.nameLabel': 'Your name',
  'home.namePlaceholder': 'e.g. Gino',
  'home.newTable': 'New table',
  'home.codePlaceholder': 'CODE',
  'home.join': 'Join',

  // Lobby
  'lobby.table': 'Table',
  'lobby.shareHint': 'Share this code (or the link) with your fellow players.',
  'lobby.copied': '✓ Link copied!',
  'lobby.copyLink': '🔗 Copy invite link',
  'lobby.copyPrompt': 'Copy this link:',
  'lobby.tagBot': 'bot',
  'lobby.tagHost': 'host',
  'lobby.emptySeat': 'open seat',
  'lobby.namePlaceholder': 'Your name',
  'lobby.sit': 'Take a seat',
  'lobby.addBot': '+ Add bot',
  'lobby.start': 'Start the game',
  'lobby.waitingHost': 'Waiting for the host to start the game…',

  // Table shell
  'table.loading': 'Loading table…',
  'table.notFound': 'Table not found',
  'table.notSeated': "This game is already in progress — you're not seated at this table.",

  // Board — generic
  'board.loadingCards': 'Loading cards…',
  'board.noTrump': 'no trump',
  'board.dealer': 'dealer',
  'board.tricks': '{n} tricks',
  'board.trickWord': 'tricks',
  'board.trumpWord': 'trump',
  'board.discardPrompt': 'Choose one card to discard (small misère)',
  'board.handPlayed': 'Hand {n} played',
  'board.nextHand': 'Next hand',
  'board.playerFallback': 'player {n}',
  'board.waiting': '{name} to move…',

  // Board — status line
  'board.status.bidding': 'Bidding',
  'board.status.biddingDouble': 'Bidding (double points!)',
  'board.status.troelTrump': 'Troel: partner chooses trump',
  'board.status.discard': 'Small misère: everyone discards a card',

  // Board — scored summary
  'board.result.made': 'made',
  'board.result.down': 'down',

  // Common
  'common.error': 'Something went wrong',

  // Suits (spoken names)
  'suit.H': 'hearts',
  'suit.D': 'diamonds',
  'suit.C': 'clubs',
  'suit.S': 'spades',

  // Bidding action groups
  'group.doorgeven': 'Pass',
  'group.troef': 'Choose trump',
  'group.samen': 'Partners',
  'group.alleen': 'Solo',
  'group.miserie': 'Misère',
  'group.abondance': 'Abondance',
  'group.soloslim': 'Solo slam',

  // Bid / action labels
  'bid.pass': 'Pass',
  'bid.wachten': 'Hold',
  'bid.vraag': 'Ask',
  'bid.meegaan': 'Accept',
  'bid.meegaanFor': 'Accept for {n}',
  'bid.alleen': 'Solo',
  'bid.abondance': 'Abondance',
  'bid.miserieKlein': 'Small misère',
  'bid.miserieGroot': 'Grand misère',
  'bid.miserieOpen': 'Open misère',
  'bid.miserieKleinShort': 'Small',
  'bid.miserieGrootShort': 'Grand',
  'bid.miserieOpenShort': 'Open',
  'bid.piccolo': 'Piccolo',
  'bid.soloSlim': 'Solo slam',
  'bid.raise': 'Raise',
  'bid.parole': 'Passe parole',
  'bid.troelKeep': 'Keep trump',
  'bid.troefShort': 'Trump',
  'bid.troefSwitchSuffix': '(9 tricks)',
  'bid.discard': 'Discard',
  'bid.play': 'Play',

  // Contract banner (kind only; suit shown separately)
  'contract.samen': 'Partners {n}',
  'contract.alleen': 'Solo {n}',
  'contract.kleineMiserie': 'Small misère',
  'contract.piccolo': 'Piccolo',
  'contract.troel': 'Troel',
  'contract.abondance': 'Abondance {n}',
  'contract.groteMiserie': 'Grand misère',
  'contract.openMiserie': 'Open misère',
  'contract.soloSlim': 'Solo slam',

  // Contract explanations (hover tooltips)
  'explain.wachten':
    'Hold: you keep the right to accept an ask later instead of bidding yourself now.',
  'explain.parole':
    'Passe parole: you hand the decision to raise back to the asker (only from 11 tricks).',
  'explain.raise': 'Raise: you promise one extra trick to stay above an intervening bid.',
  'explain.troelKeep':
    'Troel: you keep the forced trump; together with your partner you must take 8 tricks.',
  'explain.troelSwitch':
    'Troel: you choose a different trump; then together you must take 9 tricks.',
  'explain.alleen':
    'Solo: you play on your own against the other three and must take {n} tricks with your own trump.',
  'explain.abondance':
    'Abondance: alone against the other three you promise {n} tricks with your own trump. You lead.',
  'explain.soloSlim':
    'Solo slam: alone against the other three you promise all 13 tricks with your own trump. You lead.',
  'explain.piccolo': 'Piccolo: you must take exactly one trick, with no trump.',
  'explain.miserieKlein':
    'Small misère: you must take no tricks at all. Everyone first discards one card; no trump.',
  'explain.miserieGroot': 'Grand misère: you must take none of the 13 tricks, with no trump.',
  'explain.miserieOpen':
    'Open misère: you must take no tricks and play with your cards face-up on the table, no trump.',
};

const DICT: Record<Lang, Dict> = { nl: NL, en: EN };

function detectInitial(): Lang {
  const stored = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) || '';
  if (stored === 'nl' || stored === 'en') return stored;
  const nav = typeof navigator !== 'undefined' ? navigator.language?.toLowerCase() ?? '' : '';
  return nav.startsWith('en') ? 'en' : 'nl';
}

/**
 * Runtime, signal-based translations. `t` reads the `lang` signal, so any
 * template expression or `computed` that calls it re-evaluates when the
 * language changes (no page reload needed). Dutch is the fallback.
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  readonly lang = signal<Lang>(detectInitial());

  setLang(lang: Lang): void {
    if (lang !== this.lang()) {
      this.lang.set(lang);
      try {
        localStorage.setItem(STORAGE_KEY, lang);
      } catch {
        // localStorage may be unavailable (private mode); language still applies for the session.
      }
    }
  }

  t(key: string, params?: Record<string, string | number>): string {
    const lang = this.lang();
    let s = DICT[lang][key] ?? NL[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
    }
    return s;
  }
}

/** Localized spoken suit name (e.g. "harten" / "hearts"). */
export function suitName(i18n: I18n, suit: Suit): string {
  return i18n.t(`suit.${suit}`);
}

const SUIT_GLYPH: Record<Suit, string> = { H: '♥', D: '♦', C: '♣', S: '♠' };

/** Full human-readable label for a bidding/board action (used as the accessible name). */
export function actionLabel(i18n: I18n, action: Action): string {
  switch (action.type) {
    case 'pass':
      return i18n.t('bid.pass');
    case 'wachten':
      return i18n.t('bid.wachten');
    case 'vraag':
      return `${i18n.t('bid.vraag')} ${SUIT_GLYPH[action.suit]}`;
    case 'meegaan':
      return action.tricks === 8 ? i18n.t('bid.meegaan') : i18n.t('bid.meegaanFor', { n: action.tricks });
    case 'alleen':
      return `${i18n.t('bid.alleen')} ${action.tricks}`;
    case 'abondance':
      return `${i18n.t('bid.abondance')} ${action.tricks} ${SUIT_GLYPH[action.suit]}`;
    case 'miserie':
      return action.variant === 'klein'
        ? i18n.t('bid.miserieKlein')
        : action.variant === 'groot'
          ? i18n.t('bid.miserieGroot')
          : i18n.t('bid.miserieOpen');
    case 'piccolo':
      return i18n.t('bid.piccolo');
    case 'soloSlim':
      return `${i18n.t('bid.soloSlim')} ${SUIT_GLYPH[action.suit]}`;
    case 'raise':
      return i18n.t('bid.raise');
    case 'parole':
      return i18n.t('bid.parole');
    case 'troelKeep':
      return i18n.t('bid.troelKeep');
    case 'troelSwitch':
      return `${i18n.t('bid.troefShort')} ${SUIT_GLYPH[action.suit]} ${i18n.t('bid.troefSwitchSuffix')}`;
    case 'discard':
      return i18n.t('bid.discard');
    case 'play':
      return i18n.t('bid.play');
  }
}

/** Localized contract name (kind + level), without the trump suit. */
export function contractName(i18n: I18n, bid: Bid): string {
  switch (bid.kind) {
    case 'samen':
      return i18n.t('contract.samen', { n: bid.tricks ?? 8 });
    case 'alleen':
      return i18n.t('contract.alleen', { n: bid.tricks ?? 5 });
    case 'abondance':
      return i18n.t('contract.abondance', { n: bid.tricks ?? 9 });
    case 'kleineMiserie':
      return i18n.t('contract.kleineMiserie');
    case 'piccolo':
      return i18n.t('contract.piccolo');
    case 'troel':
      return i18n.t('contract.troel');
    case 'groteMiserie':
      return i18n.t('contract.groteMiserie');
    case 'openMiserie':
      return i18n.t('contract.openMiserie');
    case 'soloSlim':
      return i18n.t('contract.soloSlim');
  }
}

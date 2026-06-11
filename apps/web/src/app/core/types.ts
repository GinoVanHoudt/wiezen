/** Mirror of the public table document written by Cloud Functions. */
export interface TablePlayer {
  uid: string;
  name: string;
  isBot: boolean;
  seat: number;
}

export interface TableDoc {
  code: string;
  status: 'lobby' | 'playing';
  hostUid: string;
  players: TablePlayer[];
  createdAt: number;
  updatedAt: number;
  game?: {
    phase: string;
    turnSeat: number | null;
    handNumber: number;
    scores: number[];
    handCounts: number[];
    lastHandSummary: string | null;
    contractLabel: string | null;
  };
}

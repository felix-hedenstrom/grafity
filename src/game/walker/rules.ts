/** Extra Searcher is repeatable — each purchase adds one more walker exploring simultaneously (Bidirectional Search excepted — it's always exactly its own two, from opposite ends). All searchers share one discovery state and one pooled Node Memory window, uncapped. */
export const SEARCHER_BASE_COST = 500
export const SEARCHER_COST_GROWTH = 1.5

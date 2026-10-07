-- 20260930000036 dropped every public policy and re-created only some tables.
-- Restore the pre-cleanup read policies for the tables it missed.

DROP POLICY IF EXISTS "Members can read lot sessions" ON public.lot_sessions;
CREATE POLICY "Members can read lot sessions" ON public.lot_sessions FOR SELECT
  USING (public.is_tournament_member(tournament_id));

DROP POLICY IF EXISTS "Members can read revealed lot entries" ON public.lot_entries;
CREATE POLICY "Members can read revealed lot entries" ON public.lot_entries FOR SELECT USING (
  status = 'SELECTED' AND
  EXISTS (SELECT 1 FROM public.lot_sessions ls WHERE ls.id = lot_session_id AND public.is_tournament_member(ls.tournament_id))
);

DROP POLICY IF EXISTS "Members can read lot turns" ON public.lot_turns;
CREATE POLICY "Members can read lot turns" ON public.lot_turns FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.lot_sessions ls WHERE ls.id = lot_session_id AND public.is_tournament_member(ls.tournament_id))
);

DROP POLICY IF EXISTS "Members can read sales" ON public.auction_sales;
CREATE POLICY "Members can read sales" ON public.auction_sales FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.auction_players ap JOIN public.auctions a ON a.id = ap.auction_id
          WHERE ap.id = auction_player_id AND public.is_tournament_member(a.tournament_id))
);

DROP POLICY IF EXISTS "Members can read scorers" ON public.match_scorers;
CREATE POLICY "Members can read scorers" ON public.match_scorers FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.matches m WHERE m.id = match_id AND public.is_tournament_member(m.tournament_id))
);

DROP POLICY IF EXISTS "Members can read score events" ON public.score_events;
CREATE POLICY "Members can read score events" ON public.score_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.matches m WHERE m.id = score_events.match_id AND public.is_tournament_member(m.tournament_id))
);

DROP POLICY IF EXISTS "Organizers can read volleyball set rules" ON public.volleyball_set_rules;
CREATE POLICY "Organizers can read volleyball set rules" ON public.volleyball_set_rules FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.volleyball_rules rule WHERE rule.id = volleyball_rule_id AND public.is_tournament_organizer(rule.tournament_id))
);

DROP POLICY IF EXISTS "Public can read public lot events" ON public.lot_public_events;
CREATE POLICY "Public can read public lot events" ON public.lot_public_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.is_public)
  OR public.is_tournament_member(tournament_id)
);

DROP POLICY IF EXISTS "Organizers can read match order scopes" ON public.match_order_scopes;
CREATE POLICY "Organizers can read match order scopes" ON public.match_order_scopes FOR SELECT
  USING (public.is_tournament_organizer(tournament_id));

DROP POLICY IF EXISTS "Organizers can read progression plans" ON public.tournament_progression_plans;
CREATE POLICY "Organizers can read progression plans" ON public.tournament_progression_plans FOR SELECT
  USING (public.is_tournament_organizer(tournament_id));

DROP POLICY IF EXISTS "Organizers can read progression seeds" ON public.progression_plan_seeds;
CREATE POLICY "Organizers can read progression seeds" ON public.progression_plan_seeds FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tournament_progression_plans p WHERE p.id = plan_id AND public.is_tournament_organizer(p.tournament_id))
);

DROP POLICY IF EXISTS "Public and members can read match timeouts" ON public.match_timeouts;
CREATE POLICY "Public and members can read match timeouts" ON public.match_timeouts FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.matches m
    JOIN public.tournaments t ON t.id = m.tournament_id
    WHERE m.id = match_timeouts.match_id
      AND (t.is_public OR public.is_tournament_member(m.tournament_id) OR public.is_assigned_scorer(m.id))
  )
);

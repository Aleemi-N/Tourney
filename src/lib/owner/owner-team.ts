import type { Api } from '@/lib/api/core';
import type { Database } from '@/lib/api/types';

export type OwnerTeam = {
    id: string;
    name: string;
    short_name: string | null;
    logo_path: string | null;
    place: string | null;
    primary_color: string | null;
    tournament_id: string;
    tournament_name: string;
};

type TeamOwnerRow = {
    team_id: string;
    teams: {
        id: string;
        name: string;
        short_name: string | null;
        logo_path: string | null;
        place: string | null;
        primary_color: string | null;
        tournament_id: string;
        tournaments: { name: string } | { name: string }[] | null;
    } | null;
};

export async function getOwnerTeams(
    api: Api<Database>,
    userId: string,
) {
    const { data, error } = await api
        .from('team_owners')
        .select('team_id, teams!inner(id, name, short_name, logo_path, place, primary_color, tournament_id, tournaments(name))')
        .eq('user_id', userId)
        .eq('status', 'ACTIVE');

    if (error) throw error;

    return ((data ?? []) as unknown as TeamOwnerRow[])
        .map((row) => {
            const team = row.teams;
            if (!team) return null;
            const tournament = Array.isArray(team.tournaments) ? team.tournaments[0] : team.tournaments;
            return {
                id: team.id,
                name: team.name,
                short_name: team.short_name,
                logo_path: team.logo_path,
                place: team.place,
                primary_color: team.primary_color,
                tournament_id: team.tournament_id,
                tournament_name: tournament?.name ?? 'Tournament',
            } satisfies OwnerTeam;
        })
        .filter((team): team is OwnerTeam => team !== null);
}

export async function getOwnerTeam(
    api: Api<Database>,
    userId: string,
    teamId: string,
) {
    const teams = await getOwnerTeams(api, userId);
    const owned = teams.find((team) => team.id === teamId);
    if (owned) return owned;

    // Allow tournament organizers to preview/access team pages
    const { data: teamData } = await api
        .from('teams')
        .select('id, name, short_name, logo_path, place, primary_color, tournament_id, tournaments!inner(name, created_by)')
        .eq('id', teamId)
        .maybeSingle();

    if (teamData) {
        const tournament = Array.isArray(teamData.tournaments) ? teamData.tournaments[0] : teamData.tournaments;
        if (tournament && tournament.created_by === userId) {
            return {
                id: teamData.id,
                name: teamData.name,
                short_name: teamData.short_name,
                logo_path: teamData.logo_path,
                place: teamData.place,
                primary_color: teamData.primary_color,
                tournament_id: teamData.tournament_id,
                tournament_name: tournament.name ?? 'Tournament',
            } satisfies OwnerTeam;
        }
    }

    return null;
}
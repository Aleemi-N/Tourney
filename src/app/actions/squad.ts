'use server';

import { createClient } from '@/lib/api/server';
import { revalidatePath } from 'next/cache';

export async function assignPlayerManuallyAction(
    tournamentId: string,
    teamId: string,
    playerId: string,
    amount: number = 0
) {
    try {
        const api = await createClient();
        const { data: { user } } = await api.auth.getUser();

        if (!user) {
            return { success: false, error: 'User is not authenticated' };
        }

        const { data, error } = await api.rpc('assign_player_manually', {
            p_tournament_id: tournamentId,
            p_team_id: teamId,
            p_player_id: playerId,
            p_acquisition_amount: amount,
        });

        if (error) {
            return { success: false, error: error.message };
        }

        revalidatePath(`/organizer/tournaments/${tournamentId}/teams`);
        revalidatePath(`/owner/teams/${teamId}/squad`);
        revalidatePath(`/owner/teams/${teamId}`);
        return { success: true, data };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to assign player';
        return { success: false, error: message };
    }
}

export async function removePlayerManuallyAction(
    tournamentId: string,
    teamPlayerId: string
) {
    try {
        const api = await createClient();
        const { data: { user } } = await api.auth.getUser();

        if (!user) {
            return { success: false, error: 'User is not authenticated' };
        }

        const { data, error } = await api.rpc('remove_player_manually', {
            p_tournament_id: tournamentId,
            p_team_player_id: teamPlayerId,
        });

        if (error) {
            return { success: false, error: error.message };
        }

        revalidatePath(`/organizer/tournaments/${tournamentId}/teams`);
        return { success: true, data };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to remove player';
        return { success: false, error: message };
    }
}


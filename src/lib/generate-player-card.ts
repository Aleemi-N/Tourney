import JSZip from 'jszip';
import { resolvePublicStorageUrl } from '@/lib/supabase/storage-url';
import { formatVolleyballPosition } from '@/lib/volleyball-positions';

export interface PlayerCardData {
  id?: string;
  display_name: string;
  photo_path?: string | null;
  primary_position?: string | null;
  secondary_position?: string | null;
  place?: string | null;
  height_cm?: number | null;
  phone?: string | null;
  date_of_birth?: string | null;
  playing_history?: string | null;
  jersey_name?: string | null;
  jersey_number?: string | null;
  jersey_size?: string | null;
  category_code?: string | null;
  base_price?: number | null;
  status?: string | null;
  auction_price_category_id?: string | null;
  attempt_number?: number;
  highestBidAmount?: number | null;
  highestBidTeamName?: string | null;
  currentlyBiddingTeamName?: string | null;
  bidCount?: number;
}

/**
 * Draws an 8-point starburst background path for placeholder cards.
 */
function drawStarburst(ctx: CanvasRenderingContext2D, cx: number, cy: number, outerRadius: number, innerRadius: number, points: number = 8) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * Generates an HTMLCanvasElement matching the reference card design exactly.
 */
export async function generatePlayerCardCanvas(
  player: PlayerCardData,
  supabase: any
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1020;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Background Gradient (Dark Gold & Charcoal Sheen)
  const bg = ctx.createLinearGradient(0, 0, 1200, 1020);
  bg.addColorStop(0, '#121420');
  bg.addColorStop(0.5, '#0a0b12');
  bg.addColorStop(1, '#050608');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1200, 1020);

  // Subtle Diagonal Ray Background
  ctx.fillStyle = 'rgba(229, 169, 60, 0.03)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(1200, 510);
  ctx.lineTo(1200, 1020);
  ctx.lineTo(0, 1020);
  ctx.closePath();
  ctx.fill();

  // Outer Gold Border with Rounded Corners
  ctx.strokeStyle = '#e5a93c';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(30, 30, 1140, 960, 36);
  ctx.stroke();

  // Inner subtle border
  ctx.strokeStyle = 'rgba(229, 169, 60, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(42, 42, 1116, 936, 28);
  ctx.stroke();

  // ── HEADER ──────────────────────────────────────────────────────────────────
  // Top Left: Volleyball Logo Circle
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#e5a93c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(90, 95, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🏐', 90, 103);

  // Tournament Title
  ctx.fillStyle = '#e5a93c';
  ctx.font = '900 18px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('VOLLEYBALL', 132, 90);
  ctx.fillStyle = '#d4af37';
  ctx.font = '800 14px sans-serif';
  ctx.fillText('TOURNAMENT', 132, 108);

  // Top Right: LIVE AUCTION Pill
  ctx.fillStyle = '#e11d48';
  ctx.beginPath();
  ctx.roundRect(920, 75, 210, 42, 21);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('● LIVE AUCTION', 1025, 102);

  // Top Divider Line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 140);
  ctx.lineTo(1140, 140);
  ctx.stroke();

  // ── MIDDLE SECTION ─────────────────────────────────────────────────────────
  // Left: Photo Container Box
  const photoBoxX = 60;
  const photoBoxY = 175;
  const photoBoxW = 440;
  const photoBoxH = 440;

  // Photo Box Background & Border
  ctx.fillStyle = '#10121a';
  ctx.strokeStyle = '#e5a93c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(photoBoxX, photoBoxY, photoBoxW, photoBoxH, 32);
  ctx.fill();
  ctx.stroke();

  // Vertical "PLAYER CARD" text along left edge of photo box
  ctx.save();
  ctx.translate(photoBoxX + 16, photoBoxY + photoBoxH - 24);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = 'rgba(229, 169, 60, 0.4)';
  ctx.font = '800 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('PLAYER CARD', 0, 0);
  ctx.restore();

  // Italic Player Number (Top-Left inside photo box)
  ctx.fillStyle = '#e5a93c';
  ctx.font = '900 italic 52px sans-serif';
  ctx.textAlign = 'left';
  const lotNum = String(player.attempt_number || 1).padStart(2, '0');
  ctx.fillText(lotNum, photoBoxX + 36, photoBoxY + 64);

  // Photo / Avatar inside Photo Box
  const photoUrl = player.photo_path ? resolvePublicStorageUrl(supabase, 'avatars', player.photo_path) : null;
  const initial = player.display_name.trim().charAt(0).toUpperCase() || 'P';

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(photoBoxX + 12, photoBoxY + 12, photoBoxW - 24, photoBoxH - 24, 24);
  ctx.clip();

  if (photoUrl) {
    try {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.src = photoUrl;
      await img.decode();
      ctx.drawImage(img, photoBoxX + 12, photoBoxY + 12, photoBoxW - 24, photoBoxH - 24);
    } catch {
      // Starburst fallback
      ctx.fillStyle = '#1c170d';
      ctx.fillRect(photoBoxX, photoBoxY, photoBoxW, photoBoxH);
      ctx.fillStyle = 'rgba(229, 169, 60, 0.15)';
      drawStarburst(ctx, photoBoxX + photoBoxW / 2, photoBoxY + photoBoxH / 2, 200, 40, 8);
      ctx.fill();

      ctx.fillStyle = '#e5a93c';
      ctx.font = '900 140px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(initial, photoBoxX + photoBoxW / 2, photoBoxY + photoBoxH / 2 + 45);
    }
  } else {
    // Starburst fallback
    ctx.fillStyle = '#1c170d';
    ctx.fillRect(photoBoxX, photoBoxY, photoBoxW, photoBoxH);
    ctx.fillStyle = 'rgba(229, 169, 60, 0.15)';
    drawStarburst(ctx, photoBoxX + photoBoxW / 2, photoBoxY + photoBoxH / 2, 200, 40, 8);
    ctx.fill();

    ctx.fillStyle = '#e5a93c';
    ctx.font = '900 140px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(initial, photoBoxX + photoBoxW / 2, photoBoxY + photoBoxH / 2 + 45);
  }
  ctx.restore();

  // Re-draw photo box border over photo edges
  ctx.strokeStyle = '#e5a93c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(photoBoxX, photoBoxY, photoBoxW, photoBoxH, 32);
  ctx.stroke();

  // Re-draw Lot Number over photo box
  ctx.fillStyle = '#e5a93c';
  ctx.font = '900 italic 52px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(lotNum, photoBoxX + 36, photoBoxY + 64);

  // Right Side: Details
  const rightX = 540;

  // Name (Large Bold Italic Text)
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 italic 48px sans-serif';
  ctx.textAlign = 'left';
  
  const nameUpper = player.display_name.toUpperCase();
  const words = nameUpper.split(' ');
  if (words.length > 1 && nameUpper.length > 14) {
    ctx.fillText(words.slice(0, Math.ceil(words.length / 2)).join(' '), rightX, photoBoxY + 50);
    ctx.fillText(words.slice(Math.ceil(words.length / 2)).join(' '), rightX, photoBoxY + 105);
  } else {
    ctx.fillText(nameUpper, rightX, photoBoxY + 65);
  }

  // Player ID
  const shortId = player.id ? player.id.substring(0, 8).toUpperCase() : 'GENUINE';
  ctx.fillStyle = '#e5a93c';
  ctx.font = '800 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`PLAYER ID: VCA-${shortId}`, rightX, photoBoxY + 140);

  // 4 Stat Rows with Gold Icon Circles
  const statRows = [
    { label: 'POSITION', value: player.primary_position ? formatVolleyballPosition(player.primary_position) : 'OPPOSITE', icon: '👤' },
    { label: 'PLAYING STYLE', value: player.secondary_position ? formatVolleyballPosition(player.secondary_position) : 'ATTACKER', icon: '✋' },
    { label: 'CATEGORY', value: player.category_code || 'A', icon: '🏅' },
    { label: 'PHONE NO.', value: player.phone || '5550000004', icon: '📞' },
  ];

  let currentY = photoBoxY + 185;
  statRows.forEach((row) => {
    // Circle Icon
    ctx.fillStyle = 'rgba(229, 169, 60, 0.1)';
    ctx.strokeStyle = '#e5a93c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(rightX + 24, currentY + 18, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(row.icon, rightX + 24, currentY + 24);

    // Label & Value
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '800 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(row.label, rightX + 60, currentY + 14);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 20px sans-serif';
    ctx.fillText(row.value, rightX + 60, currentY + 36);

    currentY += 62;
  });

  // ── BOTTOM SECTION: BIDDING CONTAINER ─────────────────────────────────────
  const bidBoxX = 60;
  const bidBoxY = 645;
  const bidBoxW = 1080;
  const bidBoxH = 175;

  ctx.fillStyle = '#0a0c14';
  ctx.strokeStyle = 'rgba(229, 169, 60, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(bidBoxX, bidBoxY, bidBoxW, bidBoxH, 28);
  ctx.fill();
  ctx.stroke();

  // Left Column: Base Price
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '800 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BASE PRICE', 230, bidBoxY + 55);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 42px sans-serif';
  const basePriceText = player.base_price != null ? `₹${Number(player.base_price).toLocaleString('en-IN')}` : '₹500';
  ctx.fillText(basePriceText, 230, bidBoxY + 115);

  // Divider Line Left
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(380, bidBoxY + 30);
  ctx.lineTo(380, bidBoxY + 145);
  ctx.stroke();

  // Center Column: CURRENT BID Gold Highlight Pill
  const pillW = 440;
  const pillH = 115;
  const pillX = 380 + (440 - pillW) / 2 + 10;
  const pillY = bidBoxY + 30;

  ctx.fillStyle = '#e5a93c';
  ctx.beginPath();
  ctx.roundRect(400, pillY, 400, pillH, 24);
  ctx.fill();

  ctx.fillStyle = '#000000';
  ctx.font = '900 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CURRENT BID', 600, pillY + 32);

  ctx.fillStyle = '#000000';
  ctx.font = '900 italic 44px sans-serif';
  const bidText = player.highestBidAmount ? `₹${Number(player.highestBidAmount).toLocaleString('en-IN')}` : 'NO BIDS';
  ctx.fillText(bidText, 600, pillY + 84);

  // Divider Line Right
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(820, bidBoxY + 30);
  ctx.lineTo(820, bidBoxY + 145);
  ctx.stroke();

  // Right Column: BID COUNT
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '800 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BID COUNT', 970, bidBoxY + 55);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 38px sans-serif';
  ctx.fillText(`🔨 ${player.bidCount ?? 0}`, 970, bidBoxY + 115);

  // ── FOOTER SECTION: HIGHEST BIDDER & CURRENTLY BIDDING ─────────────────────
  const footBoxX = 60;
  const footBoxY = 840;
  const footBoxW = 1080;
  const footBoxH = 120;

  ctx.fillStyle = '#0a0c14';
  ctx.strokeStyle = 'rgba(229, 169, 60, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(footBoxX, footBoxY, footBoxW, footBoxH, 24);
  ctx.fill();
  ctx.stroke();

  // Left: Highest Bidder
  ctx.fillStyle = 'rgba(229, 169, 60, 0.1)';
  ctx.strokeStyle = '#e5a93c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(120, footBoxY + 60, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🛡️', 120, footBoxY + 67);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '800 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('HIGHEST BIDDER', 160, footBoxY + 46);

  ctx.fillStyle = '#e5a93c';
  ctx.font = '900 24px sans-serif';
  ctx.fillText(player.highestBidTeamName || '—', 160, footBoxY + 80);

  // Right: Currently Bidding
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(680, footBoxY + 60, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('👤', 680, footBoxY + 67);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '800 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('CURRENTLY BIDDING', 720, footBoxY + 46);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 24px sans-serif';
  ctx.fillText(player.currentlyBiddingTeamName || player.highestBidTeamName || '—', 720, footBoxY + 80);

  return canvas;
}

/**
 * Downloads a single player card as a PNG file matching the exact card design.
 */
export async function downloadSinglePlayerCardPNG(
  player: PlayerCardData,
  supabase: any
): Promise<void> {
  const canvas = await generatePlayerCardCanvas(player, supabase);
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  const safeName = player.display_name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  link.download = `player_auction_card_${safeName}.png`;
  link.href = dataUrl;
  link.click();
}

/**
 * Downloads ALL player auction cards as a single bundled ZIP file.
 */
export async function downloadAllPlayerCardsZip(
  players: any[],
  auctionCategories: any[],
  supabase: any,
  onProgress?: (current: number, total: number) => void,
  auctionOrderMap?: Record<string, number>
): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder('player_auction_cards');

  for (let i = 0; i < players.length; i++) {
    const rawPlayer = players[i];
    const profile = rawPlayer.player_profiles || rawPlayer.profile || rawPlayer;
    const assignedCat = auctionCategories.find(
      (c) => c.id === rawPlayer.auction_price_category_id
    );

    const cardData: PlayerCardData = {
      id: profile.id || rawPlayer.id,
      display_name: profile.display_name || rawPlayer.display_name || `Player ${i + 1}`,
      photo_path: profile.photo_path || rawPlayer.photo_path,
      primary_position: profile.primary_position || rawPlayer.primary_position,
      secondary_position: profile.secondary_position || rawPlayer.secondary_position,
      place: profile.place || rawPlayer.place,
      height_cm: profile.height_cm || rawPlayer.height_cm,
      phone: profile.phone || rawPlayer.phone,
      jersey_name: profile.jersey_name || rawPlayer.jersey_name,
      jersey_number: profile.jersey_number || rawPlayer.jersey_number,
      jersey_size: profile.jersey_size || rawPlayer.jersey_size,
      category_code: assignedCat?.code || rawPlayer.category_code || null,
      base_price: assignedCat?.base_price || rawPlayer.base_price || null,
      attempt_number: i + 1,
    };

    if (onProgress) {
      onProgress(i + 1, players.length);
    }

    try {
      const canvas = await generatePlayerCardCanvas(cardData, supabase);
      const dataUrl = canvas.toDataURL('image/png');
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');

      const pos = cardData.primary_position ? formatVolleyballPosition(cardData.primary_position).replace(/[^a-zA-Z0-9]/g, '') : 'Player';
      const cat = cardData.category_code ? `Cat_${cardData.category_code}` : 'Unclassified';
      const safeName = cardData.display_name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const orderNum = auctionOrderMap && cardData.id && auctionOrderMap[cardData.id] ? auctionOrderMap[cardData.id] : (i + 1);
      const indexStr = String(orderNum).padStart(2, '0');
      const fileName = `${indexStr}_${safeName}_${pos}_${cat}.png`;

      folder?.file(fileName, base64Data, { base64: true });
    } catch (err) {
      console.error(`Failed to generate card for player ${cardData.display_name}:`, err);
    }
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = `all_player_auction_cards_${Date.now()}.zip`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Downloads all player photos as a single ZIP file.
 * Players without a photo_path are skipped silently.
 */
export async function downloadAllPlayerPhotosZip(
  players: any[],
  supabase: any,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder('player_photos');

  let downloaded = 0;
  const total = players.length;

  for (let i = 0; i < players.length; i++) {
    const rawPlayer = players[i];

    // player_profiles can be an array (Supabase join) or an object — handle both
    const profilesRaw = rawPlayer.player_profiles;
    const profile = Array.isArray(profilesRaw)
      ? profilesRaw[0]
      : (profilesRaw || rawPlayer.profile || null);

    const photoPath: string | null | undefined =
      profile?.photo_path ?? rawPlayer.photo_path ?? null;
    const displayName: string =
      profile?.display_name ?? rawPlayer.display_name ?? `Player_${i + 1}`;

    if (onProgress) onProgress(i + 1, total);

    if (!photoPath) continue;

    try {
      const photoUrl = resolvePublicStorageUrl(supabase, 'avatars', photoPath);
      if (!photoUrl) continue;

      const res = await fetch(photoUrl);
      if (!res.ok) continue;

      const blob = await res.blob();
      const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
      const safeName = displayName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const indexStr = String(i + 1).padStart(2, '0');
      const fileName = `${indexStr}_${safeName}_photo.${ext}`;

      const arrayBuffer = await blob.arrayBuffer();
      folder?.file(fileName, arrayBuffer);
      downloaded++;
    } catch {
      // skip failed individual photo
    }
  }

  if (downloaded === 0) {
    throw new Error('No photos available to download.');
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = `player_photos_${Date.now()}.zip`;
  link.click();
  URL.revokeObjectURL(url);
}

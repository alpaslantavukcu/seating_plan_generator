// Drag-and-drop seat exchange within the visible room (mouse only; touch
// screens use tap-to-swap in step-plan.js).
// Occupied -> occupied: swap the two students. Occupied -> empty: move.

let source = null; // {room, seat}

export function initDnd({ onSwap }) {
  const wrap = document.getElementById('grid-wrap');

  wrap.addEventListener('dragstart', (e) => {
    const seat = e.target.closest('.g-seat.occupied');
    if (!seat) return;
    source = { room: seat.dataset.room, seat: Number(seat.dataset.seat) };
    seat.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // Firefox needs data to start a drag
  });

  wrap.addEventListener('dragend', (e) => {
    e.target.closest('.g-seat')?.classList.remove('dragging');
    wrap.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
    source = null;
  });

  wrap.addEventListener('dragover', (e) => {
    const seat = e.target.closest('.g-seat');
    if (!seat || seat.classList.contains('disabled') || !source) return;
    if (Number(seat.dataset.seat) === source.seat) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    seat.classList.add('drop-target');
  });

  wrap.addEventListener('dragleave', (e) => {
    const seat = e.target.closest('.g-seat');
    if (seat && !seat.contains(e.relatedTarget)) seat.classList.remove('drop-target');
  });

  wrap.addEventListener('drop', (e) => {
    const seat = e.target.closest('.g-seat');
    if (!seat || !source) return;
    e.preventDefault();
    const target = { room: seat.dataset.room, seat: Number(seat.dataset.seat) };
    const src = source;
    source = null;
    if (src.room === target.room && src.seat === target.seat) return;
    onSwap(src, target);
  });
}

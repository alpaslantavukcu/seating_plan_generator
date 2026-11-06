// Seeded shuffle + sequential seat assignment.
// Port of generate_seating_plan from seating_plan_generator.py. Python-seed
// compatibility is not a goal; reproducibility within this app is (same seed
// + same list + same rooms => same plan).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % 1000000; // short enough to note down and re-enter
}

export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function totalCapacity(selectedRooms, rooms, customCapacities) {
  return selectedRooms.reduce((sum, id) => {
    const cap = customCapacities[id] ?? rooms[id].capacity;
    return sum + Math.min(cap, rooms[id].capacity);
  }, 0);
}

// Returns {plan, usedSeed}. plan: {roomId: [{seat, cell, studentIdx|null}]}
// — one entry per physical seat of the room, in seat-number (fill) order.
// studentIdx indexes into the students array so inline edits stay linked.
export function assign(students, selectedRooms, rooms, customCapacities, seed) {
  const usedSeed = seed === '' || seed == null ? randomSeed() : Number(seed) >>> 0;
  const rng = mulberry32(usedSeed);

  const order = shuffle(students.map((_, i) => i), rng);

  const capacity = totalCapacity(selectedRooms, rooms, customCapacities);
  if (students.length > capacity) {
    const err = new Error('capacity');
    err.code = 'capacity';
    err.capacity = capacity;
    throw err;
  }

  const plan = {};
  let next = 0;
  for (const roomId of selectedRooms) {
    const room = rooms[roomId];
    const cap = Math.min(customCapacities[roomId] ?? room.capacity, room.capacity);
    let filled = 0;
    plan[roomId] = room.seats.map((s) => {
      const take = next < order.length && filled < cap;
      const entry = { seat: s.n, cell: s.cell, studentIdx: take ? order[next] : null };
      if (take) { next++; filled++; }
      return entry;
    });
  }
  return { plan, usedSeed };
}

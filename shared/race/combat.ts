import { FIXED_DT } from '../constants.ts';
import { RAPIER, STATIC_QUERY_GROUPS } from '../physics/rapier.ts';
import type RaceCar from './RaceCar.ts';
import type RaceSimulation from './RaceSimulation.ts';
import { ITEMS, WEAPON, type ItemKind } from './items.ts';

export interface Projectile {
  id: number;
  kind: 'pulse' | 'missile';
  owner: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  expireTick: number;
  target: string | null;
  sampleHint: number;
}

export interface Mine {
  id: number;
  owner: string;
  x: number;
  y: number;
  z: number;
  armTick: number;
  expireTick: number;
  /** The owner cannot set it off before this tick (a mine thrown forward lies in their own path). */
  ownerSafeTick: number;
}

const PROJECTILE_HEIGHT = 0.9;
const MUZZLE_OFFSET = 3.2;
const MINE_DROP_DISTANCE = 3.6;
/** A mine thrown forward lands this far ahead of the car. */
const MINE_THROW_DISTANCE = 26;
const MINE_OWNER_GRACE_TICKS = 3 * 60;
const CAR_CENTER_HEIGHT = 0.5;

/** Weapons, defensive items and the damage they cause. All decisions happen here, server-side. */
export class Combat {
  readonly projectiles: Projectile[] = [];
  readonly mines: Mine[] = [];
  private nextId = 1;
  private readonly sim: RaceSimulation;

  constructor(sim: RaceSimulation) {
    this.sim = sim;
  }

  /**
   * Use the held item. Aimed items follow the look-back button: pulse and missile fire forward, or backward
   * while looking back; a mine is thrown ahead, or dropped behind while looking back.
   */
  useItem(car: RaceCar, backward = false): void {
    const { sim } = this;
    const kind = car.item;
    if (!kind || sim.tick < car.itemReadyTick || car.finished || sim.phase !== 'racing') return;
    car.item = null;
    car.itemReadyTick = sim.tick + WEAPON.useCooldownTicks;
    const id = this.nextId++;
    sim.events.push({ t: 'fire', car: car.id, item: kind, id });

    switch (kind) {
      case 'pulse':
      case 'missile':
        this.launch(car, kind, id, backward);
        break;
      case 'shock':
        this.shock(car, id);
        break;
      case 'mine':
        this.placeMine(car, id, backward);
        break;
      case 'shield':
        car.shieldUntil = sim.tick + WEAPON.shieldTicks;
        car.shieldAbsorb = WEAPON.shieldAbsorb;
        sim.events.push({ t: 'shield', car: car.id, on: true });
        break;
      case 'repair': {
        const before = car.health;
        car.health = Math.min(car.maxHealth, car.health + WEAPON.repairAmount);
        sim.events.push({ t: 'repair', car: car.id, amount: car.health - before });
        break;
      }
      case 'nitro':
        car.physics.addNitro(WEAPON.nitroCell);
        break;
    }
  }

  update(): void {
    this.updateShields();
    this.updateProjectiles();
    this.updateMines();
  }

  private updateShields(): void {
    for (const car of this.sim.cars) {
      if (car.shieldUntil > 0 && !car.hasShield(this.sim.tick)) {
        car.shieldUntil = 0;
        this.sim.events.push({ t: 'shield', car: car.id, on: false });
      }
    }
  }

  private launch(car: RaceCar, kind: 'pulse' | 'missile', id: number, backward: boolean): void {
    const p = car.physics.body.translation();
    const f = car.physics.forward;
    const flat = Math.hypot(f.x, f.z) || 1;
    const aim = backward ? -1 : 1;
    const dx = (f.x / flat) * aim;
    const dz = (f.z / flat) * aim;
    const speed = kind === 'pulse' ? WEAPON.pulseSpeed : WEAPON.missileSpeed;
    // Forward shots inherit the car's speed; backward shots fly at their own speed over the ground.
    const carSpeed = backward ? 0 : Math.max(0, car.physics.forwardSpeed);
    this.projectiles.push({
      id,
      kind,
      owner: car.id,
      x: p.x + dx * MUZZLE_OFFSET,
      y: p.y + PROJECTILE_HEIGHT,
      z: p.z + dz * MUZZLE_OFFSET,
      vx: dx * (speed + carSpeed),
      vz: dz * (speed + carSpeed),
      expireTick: this.sim.tick + (kind === 'pulse' ? WEAPON.pulseLifetime : WEAPON.missileLifetime),
      target: kind === 'missile' ? this.pickMissileTarget(car, backward) : null,
      sampleHint: car.sampleHint
    });
  }

  /** Closest rival ahead in race order (behind, when fired backward), within range and roughly in the aim. */
  private pickMissileTarget(owner: RaceCar, backward: boolean): string | null {
    const p = owner.physics.body.translation();
    const aim = backward ? -1 : 1;
    const f = { x: owner.physics.forward.x * aim, z: owner.physics.forward.z * aim };
    let best: RaceCar | null = null;
    let bestGap = Infinity;
    for (const car of this.sim.cars) {
      if (car === owner || car.finished || car.isWrecked(this.sim.tick)) continue;
      const gap = (car.progress - owner.progress) * aim;
      if (gap <= 0) continue;
      const q = car.physics.body.translation();
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const distance = Math.hypot(dx, dz);
      if (distance > WEAPON.missileRange) continue;
      const facing = (dx * f.x + dz * f.z) / (distance || 1);
      if (facing < WEAPON.missileCone) continue;
      if (gap < bestGap) {
        best = car;
        bestGap = gap;
      }
    }
    return best?.id ?? null;
  }

  private updateProjectiles(): void {
    const { sim } = this;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const shot = this.projectiles[i];
      if (sim.tick >= shot.expireTick) {
        this.explode(shot.id, shot.kind, shot.x, shot.y, shot.z);
        this.projectiles.splice(i, 1);
        continue;
      }
      if (shot.kind === 'missile') this.steerMissile(shot);

      const nx = shot.x + shot.vx * FIXED_DT;
      const nz = shot.z + shot.vz * FIXED_DT;
      const location = sim.locator.locate(nx, nz, shot.sampleHint);
      shot.sampleHint = location.index;
      const ny = sim.track.samples[location.index].y + PROJECTILE_HEIGHT;

      const victim = this.sweepCars(shot, nx, ny, nz);
      if (victim) {
        this.hit(victim, shot.owner, shot.kind, shot.vx, shot.vz);
        this.explode(shot.id, shot.kind, nx, ny, nz);
        this.projectiles.splice(i, 1);
        continue;
      }
      if (this.hitsWall(shot.x, shot.y, shot.z, nx, ny, nz)) {
        this.explode(shot.id, shot.kind, shot.x, shot.y, shot.z);
        this.projectiles.splice(i, 1);
        continue;
      }
      shot.x = nx;
      shot.y = ny;
      shot.z = nz;
    }
  }

  /** Turn toward the target at a limited rate; the missile still flies into walls if the target is behind one. */
  private steerMissile(shot: Projectile): void {
    const target = shot.target ? this.sim.carsById.get(shot.target) : undefined;
    if (!target || target.isWrecked(this.sim.tick) || target.finished) return;
    const q = target.physics.body.translation();
    const heading = Math.atan2(shot.vx, shot.vz);
    const desired = Math.atan2(q.x - shot.x, q.z - shot.z);
    let delta = desired - heading;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const maxTurn = WEAPON.missileTurnRate * FIXED_DT;
    const turned = heading + Math.max(-maxTurn, Math.min(maxTurn, delta));
    const speed = Math.hypot(shot.vx, shot.vz);
    shot.vx = Math.sin(turned) * speed;
    shot.vz = Math.cos(turned) * speed;
  }

  private sweepCars(shot: Projectile, nx: number, ny: number, nz: number): RaceCar | null {
    let best: RaceCar | null = null;
    let bestT = Infinity;
    for (const car of this.sim.cars) {
      if (car.id === shot.owner || car.finished || car.isWrecked(this.sim.tick)) continue;
      const c = car.physics.body.translation();
      const t = segmentSphere(shot.x, shot.y, shot.z, nx, ny, nz, c.x, c.y + CAR_CENTER_HEIGHT, c.z, WEAPON.hitRadius);
      if (t !== null && t < bestT) {
        best = car;
        bestT = t;
      }
    }
    return best;
  }

  private hitsWall(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-6) return false;
    const ray = new RAPIER.Ray({ x: ax, y: ay, z: az }, { x: dx / length, y: dy / length, z: dz / length });
    return this.sim.physics.world.castRay(ray, length, true, undefined, STATIC_QUERY_GROUPS) !== null;
  }

  private shock(car: RaceCar, id: number): void {
    const p = car.physics.body.translation();
    for (const other of this.sim.cars) {
      if (other === car) continue;
      const q = other.physics.body.translation();
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const distance = Math.hypot(dx, dz);
      if (distance > WEAPON.shockRadius) continue;
      this.hit(other, car.id, 'shock', dx / (distance || 1), dz / (distance || 1));
    }
    this.explode(id, 'shock', p.x, p.y, p.z);
  }

  private placeMine(car: RaceCar, id: number, behind: boolean): void {
    const own = this.mines.filter((mine) => mine.owner === car.id);
    if (own.length >= WEAPON.minesPerOwner) this.mines.splice(this.mines.indexOf(own[0]), 1);
    const p = car.physics.body.translation();
    const f = car.physics.forward;
    const offset = behind ? -MINE_DROP_DISTANCE : MINE_THROW_DISTANCE;
    const x = p.x + f.x * offset;
    const z = p.z + f.z * offset;
    const location = this.sim.locator.locate(x, z, car.sampleHint);
    this.mines.push({
      id,
      owner: car.id,
      x,
      y: this.sim.track.samples[location.index].y + 0.25,
      z,
      armTick: this.sim.tick + WEAPON.mineArmTicks,
      expireTick: this.sim.tick + WEAPON.mineLifetime,
      ownerSafeTick: behind ? 0 : this.sim.tick + MINE_OWNER_GRACE_TICKS
    });
  }

  private updateMines(): void {
    const { sim } = this;
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const mine = this.mines[i];
      if (sim.tick >= mine.expireTick) {
        this.mines.splice(i, 1);
        continue;
      }
      if (sim.tick < mine.armTick) continue;
      const victim = sim.cars.find((car) => {
        if (car.finished || car.isWrecked(sim.tick)) return false;
        if (car.id === mine.owner && sim.tick < mine.ownerSafeTick) return false;
        const q = car.physics.body.translation();
        return Math.hypot(q.x - mine.x, q.z - mine.z) < WEAPON.mineTriggerRadius && Math.abs(q.y - mine.y) < 2.5;
      });
      if (!victim) continue;
      const v = victim.physics.velocity;
      this.hit(victim, mine.owner, 'mine', v.x, v.z);
      this.explode(mine.id, 'mine', mine.x, mine.y, mine.z);
      this.mines.splice(i, 1);
    }
  }

  /**
   * Shields absorb damage and push from every weapon (pulse, missile, shock, mine) until their charge is spent.
   * They never block collision damage. Freshly respawned and finished cars are untouchable.
   */
  private hit(victim: RaceCar, by: string, kind: ItemKind, dirX: number, dirZ: number): void {
    const { sim } = this;
    if (victim.isInvulnerable(sim.tick)) return;
    const config = ITEMS[kind];
    if (victim.hasShield(sim.tick)) {
      victim.shieldAbsorb -= config.damage;
      sim.events.push({ t: 'hit', car: victim.id, by, item: kind, damage: 0, blocked: true });
      if (victim.shieldAbsorb <= 0) {
        victim.shieldUntil = 0;
        sim.events.push({ t: 'shield', car: victim.id, on: false });
      }
      return;
    }
    const length = Math.hypot(dirX, dirZ) || 1;
    const m = victim.physics.mass;
    victim.physics.applyImpulse(
      { x: (dirX / length) * config.push * m, y: config.lift * m, z: (dirZ / length) * config.push * m },
      { x: (dirZ / length) * m * 0.6, y: 0, z: (-dirX / length) * m * 0.6 }
    );
    victim.physics.drifting = false;
    sim.damage(victim, config.damage, by, kind);
  }

  private explode(id: number, item: ItemKind, x: number, y: number, z: number): void {
    this.sim.events.push({ t: 'explode', id, item, x, y, z });
  }
}

/** Earliest t in [0,1] where the segment AB enters the sphere, or null. */
export function segmentSphere(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number, radius: number
): number | null {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const fx = ax - cx, fy = ay - cy, fz = az - cz;
  const a = dx * dx + dy * dy + dz * dz;
  const c = fx * fx + fy * fy + fz * fz - radius * radius;
  if (c <= 0) return 0;
  if (a < 1e-9) return null;
  const b = 2 * (fx * dx + fy * dy + fz * dz);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

const request = require('supertest');
const { app } = require('../app');
const { connectTestDB, closeTestDB, clearTestDB } = require('./setup');
const { redisClient, connectRedis } = require('../config/redis');

// Ensure JWT_SECRET exists for tests even if .env isn't loaded in this context
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-jest-only';

beforeAll(async () => {
  await connectTestDB();
  // routes/cards.js and routes/columns.js call redisClient.del() on every
  // write (added in Step 7) - without connecting here, every column/card
  // creation in these tests fails with "The client is closed", which
  // silently broke this entire suite for two steps before anyone noticed.
  await connectRedis();
});

afterAll(async () => {
  await closeTestDB();
  await redisClient.quit();
});

afterEach(async () => {
  await clearTestDB();
});

// helper: signs up a user and returns their auth token
async function createUser(email) {
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ name: 'Test User', email, password: 'password123' });
  return res.body.token;
}

// helper: creates a board + column + card, returns their ids and the card
async function createBoardColumnCard(token) {
  const boardRes = await request(app)
    .post('/api/boards')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Test Board' });
  const boardId = boardRes.body._id;

  const columnRes = await request(app)
    .post('/api/columns')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Test Column', boardId, order: 0 });
  const columnId = columnRes.body._id;

  const cardRes = await request(app)
    .post('/api/cards')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Original Title', columnId, order: 0 });

  return { boardId, columnId, card: cardRes.body };
}

describe('Card conflict detection', () => {
  test('no conflict when expectedVersion matches current version', async () => {
    const token = await createUser('user1@test.com');
    const { card } = await createBoardColumnCard(token);

    const res = await request(app)
      .patch(`/api/cards/${card._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated Title', expectedVersion: card.version });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
    expect(res.body.version).toBe(card.version + 1);
    expect(res.body.conflictHistory).toHaveLength(0); // no conflict should be logged
  });

  test('conflict detected and logged when expectedVersion is stale, but write still succeeds', async () => {
    const token = await createUser('user2@test.com');
    const { card } = await createBoardColumnCard(token);

    // first update - simulates User A saving first, bumping version to 1
    await request(app)
      .patch(`/api/cards/${card._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'User A title', expectedVersion: card.version });

    // second update - simulates User B saving with a STALE expectedVersion
    // (still thinks the version is 0, but it's actually 1 now)
    const res = await request(app)
      .patch(`/api/cards/${card._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'User B description', expectedVersion: card.version }); // stale on purpose

    // last-write-wins (Option B, locked decision): the write must still succeed,
    // never rejected outright, even though it was based on stale data
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('User B description');
    // a conflict record should now exist, proving the mismatch was detected
    expect(res.body.conflictHistory.length).toBeGreaterThan(0);
  });

  test('two genuinely simultaneous updates do not silently lose data (true concurrency, not sequential)', async () => {
    const token = await createUser('user4@test.com');
    const { card } = await createBoardColumnCard(token);

    // fire both requests at once with Promise.all - this is the key difference
    // from every other test here, which sends requests one after another.
    // Both requests use the SAME expectedVersion (the card's original version),
    // simulating two clients that both loaded the card before either saved -
    // exactly the scenario the old read-then-save pattern could mishandle.
    const [resA, resB] = await Promise.all([
      request(app)
        .patch(`/api/cards/${card._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Title from request A', expectedVersion: card.version }),
      request(app)
        .patch(`/api/cards/${card._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Description from request B', expectedVersion: card.version }),
    ]);

    // both requests must succeed - true last-write-wins means neither is
    // rejected, regardless of the race
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    // the version must have incremented exactly twice - once per request -
    // proving MongoDB's atomic $inc correctly serialized both writes rather
    // than one silently clobbering the other's increment
    const finalVersion = Math.max(resA.body.version, resB.body.version);
    expect(finalVersion).toBe(card.version + 2);

    // at least one of the two requests must show a detected conflict,
    // since they raced on the same expectedVersion - this is the crux of
    // the fix: the OLD code could let both requests believe there was no
    // conflict, since both might read the same stale version before either
    // wrote. With the atomic update, whichever request's write actually
    // executes second MUST see the first one's already-applied change.
    const eitherDetectedConflict =
      resA.body.conflictHistory.length > 0 || resB.body.conflictHistory.length > 0;
    expect(eitherDetectedConflict).toBe(true);
  });

  test('untouched fields are not overwritten during a conflicting update', async () => {
    const token = await createUser('user3@test.com');
    const { card } = await createBoardColumnCard(token);

    // User A changes the title
    const afterA = await request(app)
      .patch(`/api/cards/${card._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'User A title', expectedVersion: card.version });

    // User B, using a stale version, updates ONLY the description - title is
    // intentionally omitted from this request entirely (frontend's "touched
    // fields" logic is what makes this possible - this test verifies the
    // backend correctly respects a partial update and doesn't require/assume
    // the title field is always present)
    const afterB = await request(app)
      .patch(`/api/cards/${card._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'User B description', expectedVersion: card.version }); // stale

    // User A's title change must survive, since User B's request never touched title
    expect(afterB.body.title).toBe('User A title');
    expect(afterB.body.description).toBe('User B description');
  });
});

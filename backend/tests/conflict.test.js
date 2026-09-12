const request = require('supertest');
const { app } = require('../app');
const { connectTestDB, closeTestDB, clearTestDB } = require('./setup');

// Ensure JWT_SECRET exists for tests even if .env isn't loaded in this context
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-jest-only';

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await closeTestDB();
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

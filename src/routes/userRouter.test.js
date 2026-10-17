const request = require("supertest");
const app = require("../service");
const { Role, DB } = require("../database/database.js");

const testUser = { name: "pizza diner", email: "reg@test.com", password: "a" };

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(
    /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/,
  );
}

let testUserAuthToken;
let testUserId;
let adminUser;
let adminUserAuthToken;
let adminUserId;

async function createAdminUser() {
  let user = { password: "toomanysecrets", roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = user.name + "@admin.com";

  await DB.addUser(user);
  return user;
}

beforeAll(async () => {
  // Setup regular user
  testUser.email = Math.random().toString(36).substring(2, 12) + "@test.com";
  const registerRes = await request(app).post("/api/auth").send(testUser);
  testUserAuthToken = registerRes.body.token;
  testUserId = registerRes.body.user.id;
  expectValidJwt(testUserAuthToken);

  // Create the admin user in the database
  adminUser = await createAdminUser();

  // Log in with the admin user to get the JWT
  const adminUserRes = await request(app).put("/api/auth").send(adminUser);
  adminUserAuthToken = adminUserRes.body.token;
  adminUserId = adminUserRes.body.user.id;
  expectValidJwt(adminUserAuthToken);
});

test("getUser", async () => {
  const res = await request(app)
    .get(`/api/user/me`)
    .set("Authorization", `Bearer ${testUserAuthToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({
    name: testUser.name,
    email: testUser.email,
  });
  // Password hash should never leak back
  expect(res.body).not.toHaveProperty("password");
});

test("updateUser", async () => {
  const updatedData = {
    email: `${randomName()}@updated.com`,
    password: "newsecretpassword123",
  };
  const res = await request(app)
    .put(`/api/user/${testUserId}`)
    .set("Authorization", `Bearer ${testUserAuthToken}`)
    .send(updatedData);

  expect(res.status).toBe(200);

  // Update local reference so subsequent tests know the current email
  testUser.email = updatedData.email;
  testUser.password = updatedData.password;
});

test("deleteUser", async () => {
  // Admin deleting the target user
  const res = await request(app)
    .delete(`/api/user/${testUserId}`)
    .set("Authorization", `Bearer ${adminUserAuthToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty("message");

  // Confirm user is no longer retrievable
  const getRes = await request(app)
    .get(`/api/user/${testUserId}`)
    .set("Authorization", `Bearer ${adminUserAuthToken}`);

  expect([404, 500]).toContain(getRes.status);
});

test("list users unauthorized", async () => {
  const listUsersRes = await request(app).get("/api/user");
  expect(listUsersRes.status).toBe(401);
});

test("list users", async () => {
  await registerUser(request(app));
  const listUsersRes = await request(app)
    .get("/api/user")
    .set("Authorization", "Bearer " + adminUserAuthToken);
  expect(listUsersRes.status).toBe(200);
});

test("list users with pagination", async () => {
  const res = await request(app)
    .get("/api/user?page=1&limit=2")
    .set("Authorization", `Bearer ${adminUserAuthToken}`);

  expect(res.status).toBe(200);
  const users = Array.isArray(res.body) ? res.body : res.body.users;
  expect(Array.isArray(users)).toBe(true);
  expect(users.length).toBeLessThanOrEqual(2);
});

test("list users with name filter", async () => {
  // Using the testUser created in beforeAll
  const res = await request(app)
    .get(`/api/user?name=${encodeURIComponent(testUser.name)}`)
    .set("Authorization", `Bearer ${adminUserAuthToken}`);

  expect(res.status).toBe(200);
  const users = Array.isArray(res.body) ? res.body : res.body.users;
  expect(Array.isArray(users)).toBe(true);

  // All returned users should match the name filter
  const matches = users.filter((u) => u.name.includes(testUser.name));
  expect(matches.length).toBeGreaterThan(0);
});

test("list users requires admin role", async () => {
  const res = await request(app)
    .get("/api/user")
    .set("Authorization", `Bearer ${testUserAuthToken}`); // Regular diner token

  expect(res.status).toBe(403);
});

async function registerUser(service) {
  const testUser = {
    name: "pizza diner",
    email: `${randomName()}@test.com`,
    password: "a",
  };
  const registerRes = await service.post("/api/auth").send(testUser);
  registerRes.body.user.password = testUser.password;

  return [registerRes.body.user, registerRes.body.token];
}

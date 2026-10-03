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

// FIXME: currently runs test with admin user because updateUser requires an admin userId in order to change it
test("updateUser", async () => {
  const updatedData = {
    email: `${randomName()}@updated.com`,
    password: "newsecretpassword123",
  };
  console.log(`adminId: ${adminUserId}`);
  const res = await request(app)
    .put(`/api/user/${adminUserId}`)
    .set("Authorization", `Bearer ${adminUserAuthToken}`)
    .send(updatedData);

  expect(res.status).toBe(200);

  // Update local reference so subsequent tests know the current email
  adminUser.email = updatedData.email;
  adminUser.password = updatedData.password;
});

test("listUsers", async () => {
  const res = await request(app)
    .get("/api/user")
    .set("Authorization", `Bearer ${adminUserAuthToken}`);

  expect(res.status).toBe(200);

  // Depending on pagination structure, res.body is either an array or { users: [...] }
  const users = Array.isArray(res.body) ? res.body : res.body.users;
  expect(Array.isArray(users)).toBe(true);
  if (users.length == 0) {
    expect(res.body.message).toBe("not implemented");
  } else {
    expect(users.length).toBeGreaterThan(0);
  }
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

const request = require("supertest");
const app = require("../service");
const { Role, DB } = require("../database/database.js");

const testUser = { name: "pizza diner", email: "reg@test.com", password: "a" };

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

let testUserAuthToken;
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
  expectValidJwt(testUserAuthToken);

  // Create the admin user in the database
  adminUser = await createAdminUser();

  // Log in with the admin user to get the JWT
  const adminUserRes = await request(app).put("/api/auth").send(adminUser);
  adminUserAuthToken = adminUserRes.body.token;
  adminUserId = adminUserRes.body.id;
  expectValidJwt(adminUserAuthToken);
});

describe("Franchise and Store CRUD operations", () => {
  let franchiseId;
  let storeId;

  // Create a franchise first
  test("createFranchise (setup for store tests)", async () => {
    const newFranchise = {
      name: randomName(),
      admins: [{ email: adminUser.email }],
    };

    const res = await request(app)
      .post("/api/franchise")
      .set("Authorization", `Bearer ${adminUserAuthToken}`)
      .send(newFranchise);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
    franchiseId = res.body.id;
  });

  // bad creation for coverage
  test("createFranchise fails without admin role", async () => {
    const newFranchise = {
      name: "Unauthorized Pizza",
      admins: [{ email: testUser.email }],
    };

    const createRes = await request(app)
      .post("/api/franchise")
      .set("Authorization", `Bearer ${testUserAuthToken}`)
      .send(newFranchise);

    expect(createRes.status).toBe(403);
  });
  // 1. Create Store
  test("createStore", async () => {
    const newStore = {
      name: randomName(),
    };

    const res = await request(app)
      .post(`/api/franchise/${franchiseId}/store`)
      .set("Authorization", `Bearer ${adminUserAuthToken}`)
      .send(newStore);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: newStore.name,
      franchiseId: franchiseId,
    });
    expect(res.body).toHaveProperty("id");

    storeId = res.body.id;
  });

  test("createStore fails without admin role", async () => {
    const newStore = {
      name: randomName(),
    };

    const res = await request(app)
      .post(`/api/franchise/${franchiseId}/store`)
      .set("Authorization", `Bearer ${testUserAuthToken}`)
      .send(newStore);

    expect(res.status).toBe(403);
  });

  // 2. Delete Store
  test("deleteStore", async () => {
    const res = await request(app)
      .delete(`/api/franchise/${franchiseId}/store/${storeId}`)
      .set("Authorization", `Bearer ${adminUserAuthToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: "store deleted",
    });
  });

  test("deleteStore fails without admin role", async () => {
    const res = await request(app)
      .delete(`/api/franchise/${franchiseId}/store/${storeId}`)
      .set("Authorization", `Bearer ${testUserAuthToken}`);

    expect(res.status).toBe(403);
  });

  // 3. Delete Franchise
  test("deleteFranchise", async () => {
    const res = await request(app)
      .delete(`/api/franchise/${franchiseId}`)
      .set("Authorization", `Bearer ${adminUserAuthToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: "franchise deleted",
    });
  });
});

//   get userFranchise
test("getUserFranchises", async () => {
  const getRes = await request(app)
    .get(`/api/franchise/${adminUser.id}`)
    .set("Authorization", `Bearer ${adminUserAuthToken}`);

  expect(getRes.status).toBe(200);
  expect(Array.isArray(getRes.body)).toBe(true);
});

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(
    /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/,
  );
}

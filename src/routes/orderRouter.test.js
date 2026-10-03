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
let adminUser;
let adminUserAuthToken;
let franchiseId;
let storeId;

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

  // Setup admin user
  const adminUserRes = await request(app).put("/api/auth").send(adminUser);
  adminUserAuthToken = adminUserRes.body.token;
  expectValidJwt(adminUserAuthToken);

  //   setup franchise
  const franchiseRes = await request(app)
    .post("/api/franchise")
    .set("Authorization", `Bearer ${adminUserAuthToken}`)
    .send({
      name: `Franchise ${randomName()}`,
      admins: [{ email: adminUser.email }],
    });
  franchiseId = franchiseRes.body.id;
  // Setup store
  const storeRes = await request(app)
    .post(`/api/franchise/${franchiseId}/store`)
    .set("Authorization", `Bearer ${adminUserAuthToken}`)
    .send({ name: `Store ${randomName()}` });
  storeId = storeRes.body.id;
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("addMenuItem", async () => {
  testMenuItem = {
    title: `Test Pizza ${randomName()}`,
    description: "Pizza for testy people",
    image: "pizza.png",
    price: 0.0015,
  };

  const res = await request(app)
    .put("/api/order/menu")
    .set("Authorization", `Bearer ${adminUserAuthToken}`)
    .send(testMenuItem);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  // Menu returns the updated full menu list containing our new item
  expect(res.body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: testMenuItem.title,
        description: testMenuItem.description,
        price: testMenuItem.price,
      }),
    ]),
  );
});

test("getMenu", async () => {
  const res = await request(app).get("/api/order/menu");

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body.length).toBeGreaterThan(0);
  expect(res.body[0]).toHaveProperty("title");
  expect(res.body[0]).toHaveProperty("price");
});

test("createOrder: place order and contact factory", async () => {
  // Mock the external call to the Pizza Factory endpoint
  const mockJwt = "mock.factory.jwt";
  jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({
      jwt: mockJwt,
      reportUrl: "https://pizza-factory.cs329.click/report/12345",
    }),
  });

  const orderPayload = {
    franchiseId: franchiseId,
    storeId: storeId,
    items: [{ menuId: 1, description: "Veggie", price: 0.0038 }],
  };

  const res = await request(app)
    .post("/api/order")
    .set("Authorization", `Bearer ${testUserAuthToken}`)
    .send(orderPayload);

  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty("order");
  expect(res.body).toHaveProperty("jwt", mockJwt);
  expect(res.body.order).toMatchObject({
    franchiseId: franchiseId,
    storeId: storeId,
    items: orderPayload.items,
  });
});

test("getOrders returns list of orders for authenticated user", async () => {
  const res = await request(app)
    .get("/api/order")
    .set("Authorization", `Bearer ${testUserAuthToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty("orders");
  expect(Array.isArray(res.body.orders)).toBe(true);
  expect(res.body.orders.length).toBeGreaterThan(0);
  expect(res.body.orders[0]).toMatchObject({
    franchiseId: franchiseId,
    storeId: storeId,
  });
});

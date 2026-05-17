import { seedTodos } from './seed-todos';
import { seedDemoUser } from './seed-user';

const userResult = await seedDemoUser();
const userStatus = userResult.created ? 'created' : 'exists';
console.log(`seed:user done. id=${userResult.id} email=${userResult.email} status=${userStatus}`);

const todosResult = await seedTodos({ userId: userResult.id, count: 3 });
console.log(`seed:todos done. user_id=${todosResult.userId} created=${todosResult.created}`);

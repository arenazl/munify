# Redis Configuration for Caching

To enable Redis caching in your application, add the following configuration to your `.env` file:

```env
# Redis configuration for caching
REDIS_URL=redis://default:password@localhost:6379/0
```

Make sure to replace `password` with your actual Redis authentication credentials. This configuration allows your application to connect to the Redis instance for caching frequently accessed data.
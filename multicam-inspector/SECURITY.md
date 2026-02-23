# Security Configuration

## Environment Variables

The following environment variables must be set for the application to run securely:

### Required
- `CAMERA_PASSWORD` - Password for camera authentication (required)
- `JWT_SECRET` - Secret key for JWT token generation (auto-generated if not set)

### Optional
- `CAMERA_USERNAME` - Username for camera authentication (default: 'admin')
- `PORT` - Server port (default: 5001)

## Setup

1. Copy `.env.example` to `.env`
2. Set your camera password:
   ```bash
   CAMERA_PASSWORD=your_actual_password
   ```
3. Generate a secure JWT secret:
   ```bash
   JWT_SECRET=$(openssl rand -base64 32)
   ```

## Security Improvements Made

### 1. Removed Test Files
- Deleted `test-capture.sh`
- Deleted `test-credentials.js`
- Deleted `test-image-fetch.sh`
- Deleted `test-light-config.js`
- Deleted `config.js.backup`

### 2. Credentials Management
- Moved hardcoded camera credentials to environment variables
- Added validation to ensure required credentials are set
- JWT secret is auto-generated if not provided

### 3. Path Traversal Protection
- Added `sanitizePath()` function to clean user input
- Added `isValidSessionPath()` to validate session paths
- Prevents directory traversal attacks (../, ~/, etc.)

### 4. Input Validation
- Session paths must match format: `hangarId/sessionName`
- Only alphanumeric characters, underscores, and hyphens allowed
- Path components are validated before file system operations

## Best Practices

1. **Never commit `.env` file** - It's in `.gitignore`
2. **Rotate credentials regularly**
3. **Use strong passwords** for camera authentication
4. **Monitor logs** for suspicious activity
5. **Keep dependencies updated** with `npm audit fix`

## Running Security Audit

```bash
# Check for vulnerabilities
npm audit

# Fix automatically where possible
npm audit fix

# Check for outdated packages
npm outdated
```

## Deployment Security

For production deployment:

1. Use environment variables on the server:
   ```bash
   export CAMERA_PASSWORD="secure_password_here"
   export JWT_SECRET="random_secret_here"
   ```

2. Or create `.env` file on server with restricted permissions:
   ```bash
   chmod 600 .env
   ```

3. Ensure HTTPS is used for all API endpoints in production

## Remaining Considerations

- Consider implementing rate limiting for API endpoints
- Add CSRF protection for state-changing operations
- Implement proper session management with expiry
- Consider using helmet.js for additional security headers
- Regular security audits and penetration testing
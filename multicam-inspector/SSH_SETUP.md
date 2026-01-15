# SSH Setup for MultiCam Inspector

## IMPORTANT: SSH Keys Required

The camera capture functionality requires passwordless SSH access from the server to the hangar systems. Without this setup, image capture will fail with "Permission denied" errors.

## Quick Setup on Server

1. **SSH into your server:**
```bash
ssh root@172.20.1.24
cd /root/multicam-inspector
```

2. **Generate SSH key (if not already done):**
```bash
ssh-keygen -t rsa -b 4096 -N "" -f ~/.ssh/id_rsa
```

3. **Copy the public key to each hangar:**

For Mölndal hangar:
```bash
ssh-copy-id system@10.0.10.113
# Enter password when prompted: FJjf93/#
```

For Forges-les-Eaux hangar:
```bash
ssh-copy-id system@10.0.10.172
# Enter password when prompted: FJjf93/#
```

4. **Test the connections:**
```bash
ssh system@10.0.10.113 echo "Mölndal OK"
ssh system@10.0.10.172 echo "Forges-les-Eaux OK"
```

Both commands should work WITHOUT asking for a password.

## Hangar Details

| Hangar | SSH Host | Password | IP Address |
|--------|----------|----------|------------|
| Mölndal | system@10.0.10.113 | FJjf93/# | 10.0.10.113 |
| Forges-les-Eaux | system@10.0.10.172 | FJjf93/# | 10.0.10.172 |

## Troubleshooting

### "Permission denied (publickey,password)" Error

This means SSH keys are not set up. Follow the setup steps above.

### "Host key verification failed"

Add `-o StrictHostKeyChecking=no` to your SSH commands or manually accept the host key:
```bash
ssh system@10.0.10.113
# Type "yes" when prompted about the host key
```

### Test Script

Run this to verify all connections work:
```bash
#!/bin/bash
echo "Testing SSH connections..."
for host in "system@10.0.10.113:Mölndal" "system@10.0.10.172:Forges"; do
    IFS=':' read -r ssh_host name <<< "$host"
    echo -n "$name... "
    if ssh -o ConnectTimeout=5 "$ssh_host" echo "OK" 2>/dev/null; then
        echo "✅"
    else
        echo "❌ FAILED"
    fi
done
```

## Adding New Hangars

When adding a new hangar:

1. Get the hangar's IP address and SSH credentials
2. From the server, run: `ssh-copy-id system@<HANGAR_IP>`
3. Test the connection
4. Update `config.js` with the new hangar details

## Security Notes

- SSH keys are stored in `/root/.ssh/` on the server
- The private key should never be shared
- Each hangar needs to have the server's public key in its `~/.ssh/authorized_keys`
- The SSH connection uses the "system" user on hangar systems
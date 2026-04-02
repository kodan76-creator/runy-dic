# deploy.ps1
npm run build
Remove-Item -Recurse -Force docs\assets -ErrorAction SilentlyContinue
Remove-Item -Force docs\index.html -ErrorAction SilentlyContinue
Copy-Item -Recurse dist\assets docs\assets
Copy-Item dist\index.html docs\index.html
git add .
git commit -m "Deploy update"
git push
Write-Host "✅ Deployed successfully!" -ForegroundColor Green
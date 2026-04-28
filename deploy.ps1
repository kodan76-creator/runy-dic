# deploy.ps1

# 1. Сборка проекта
npm run build

# 2. Копирование файлов в docs (с проверкой существования)
if (Test-Path "dist\assets") {
    Copy-Item -Recurse -Force dist\assets docs\
}
if (Test-Path "dist\index.html") {
    Copy-Item -Force dist\index.html docs\
}
if (Test-Path "dist\audio") {
    Copy-Item -Recurse -Force dist\audio docs\
}

# 3. Git операции
git add .
git commit -m "Deploy $(Get-Date -Format 'yyyy-MM-dd HH:mm')" --allow-empty

# 4. Pull перед push (чтобы избежать конфликта)
git pull --rebase origin main

# 5. Push
git push origin main

Write-Host "`n✅ Деплой завершён!" -ForegroundColor Green
Write-Host "Откройте: https://kodan76-creator.github.io/runy-dic/" -ForegroundColor Cyan
-- CreateIndex
CREATE INDEX "Log_userId_idx" ON "Log"("userId");

-- CreateIndex
CREATE INDEX "Log_userId_rmpId_idx" ON "Log"("userId", "rmpId");

-- CreateIndex
CREATE INDEX "Log_start_idx" ON "Log"("start");

-- CreateIndex
CREATE INDEX "Rmp_userId_idx" ON "Rmp"("userId");

-- CreateIndex
CREATE INDEX "Rmp_userId_status_idx" ON "Rmp"("userId", "status");

-- CreateIndex
CREATE INDEX "Rmp_filedDate_idx" ON "Rmp"("filedDate");

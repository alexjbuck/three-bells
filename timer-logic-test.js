// Test timer logic without browser
// Simulating the core timer state management

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((v) => v.toString().padStart(2, "0")).join(":");
}

function testTimerLogic() {
  console.log("Testing Timer Logic\n");

  // Test 1: Format time
  console.log("Test 1: Format time");
  console.log("  0ms ->", formatTime(0), "(expected: 00:00:00)");
  console.log("  1000ms ->", formatTime(1000), "(expected: 00:00:01)");
  console.log("  60000ms ->", formatTime(60000), "(expected: 00:01:00)");
  console.log("  3661000ms ->", formatTime(3661000), "(expected: 01:01:01)");
  console.log("");

  // Test 2: Start timer
  console.log("Test 2: Start timer");
  const startTime = new Date().toISOString();
  console.log("  Start time:", startTime);
  const startDate = new Date(startTime);
  console.log("  Parsed start date:", startDate);
  console.log("  Is valid date:", !isNaN(startDate.getTime()));
  console.log("");

  // Test 3: Simulate elapsed time
  console.log("Test 3: Calculate elapsed time");
  const now = Date.now();
  const elapsed = now - startDate.getTime();
  console.log("  Elapsed:", elapsed, "ms");
  console.log("  Formatted:", formatTime(elapsed));
  console.log("");

  // Test 4: Pause and resume
  console.log("Test 4: Pause and resume");
  const pauseTime = Date.now();
  const elapsedAtPause = 5000; // 5 seconds elapsed
  console.log("  Elapsed at pause:", elapsedAtPause, "ms");

  // Simulate 2 seconds passing while paused
  const resumeTime = pauseTime + 2000;
  console.log("  Resume after:", resumeTime - pauseTime, "ms");

  // Calculate new start time when resuming
  const newStartTime = new Date(resumeTime - elapsedAtPause).toISOString();
  console.log("  New start time:", newStartTime);

  // Verify: if we calculate elapsed from new start time, it should be ~5000ms
  const newElapsed = resumeTime - new Date(newStartTime).getTime();
  console.log("  New elapsed:", newElapsed, "ms (should be ~5000)");
  console.log("");

  // Test 5: Form population
  console.log("Test 5: Form population from timer");
  const testStartTime = "2026-01-05T10:30:00.000Z";
  const testElapsedMs = 7380000; // 2 hours, 3 minutes
  const testStartDate = new Date(testStartTime);
  const testEndDate = new Date(testStartDate.getTime() + testElapsedMs);

  const year = testStartDate.getFullYear();
  const month = String(testStartDate.getMonth() + 1).padStart(2, "0");
  const day = String(testStartDate.getDate()).padStart(2, "0");
  const workDate = `${year}-${month}-${day}`;

  const startHours = String(testStartDate.getHours()).padStart(2, "0");
  const startMinutes = String(testStartDate.getMinutes()).padStart(2, "0");
  const startTimeStr = `${startHours}:${startMinutes}`;

  const endHours = String(testEndDate.getHours()).padStart(2, "0");
  const endMinutes = String(testEndDate.getMinutes()).padStart(2, "0");
  const endTimeStr = `${endHours}:${endMinutes}`;

  console.log("  Work date:", workDate);
  console.log("  Start time:", startTimeStr);
  console.log("  End time:", endTimeStr);
  console.log("  Duration:", formatTime(testElapsedMs));
  console.log("");

  // Test 6: Edge case - null start time (shouldn't happen but let's check)
  console.log("Test 6: Edge case - null start time");
  const nullDate = new Date(null);
  console.log("  new Date(null):", nullDate);
  console.log("  Is valid:", !isNaN(nullDate.getTime()));
  console.log("  Value:", nullDate.getTime(), "(epoch time)");
  console.log("  WARNING: This would create 1970-01-01 date if timer stopped while idle");
  console.log("");

  // Test 7: LocalStorage serialization
  console.log("Test 7: LocalStorage serialization");
  const timerState = {
    status: "running",
    startTime: new Date().toISOString(),
    elapsedMs: 5000,
    pausedMs: 0,
  };
  const serialized = JSON.stringify(timerState);
  console.log("  Serialized:", serialized);
  const deserialized = JSON.parse(serialized);
  console.log("  Deserialized:", deserialized);
  console.log("  Start time matches:", timerState.startTime === deserialized.startTime);
  console.log("");

  console.log("All tests completed!");
}

testTimerLogic();

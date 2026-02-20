/**
 * Cost Analysis Script
 * Calculates estimated costs based on AWS pricing
 */

interface CostBreakdown {
  lambda: {
    invocations: number;
    gbSeconds: number;
    cost: number;
  };
  dynamodb: {
    readUnits: number;
    writeUnits: number;
    cost: number;
  };
  apiGateway: {
    requests: number;
    cacheHours: number;
    cost: number;
  };
  total: number;
}

// AWS Pricing (Approximate, us-east-1)
const PRICING = {
  LAMBDA: {
    REQUEST: 0.2 / 1000000, // $0.20 per 1M requests
    GB_SECOND: 0.0000166667, // $0.0000166667 per GB-second
  },
  DYNAMODB: {
    READ_UNIT: 0.25 / 1000000, // $0.25 per 1M read units
    WRITE_UNIT: 1.25 / 1000000, // $1.25 per 1M write units
  },
  API_GATEWAY: {
    REQUEST: 1.0 / 1000000, // $1.00 per 1M requests
    CACHE_GB_HOUR: 0.02, // $0.02 per GB-hour
  },
};

function calculateCosts(
  invocations: number,
  avgDurationMs: number,
  memoryMB: number,
  readUnits: number,
  writeUnits: number,
  apiRequests: number,
  cacheSizeGB: number,
): CostBreakdown {
  // Lambda Cost
  const gbSeconds = ((invocations * avgDurationMs) / 1000) * (memoryMB / 1024);
  const lambdaComputeCost = gbSeconds * PRICING.LAMBDA.GB_SECOND;
  const lambdaRequestCost = invocations * PRICING.LAMBDA.REQUEST;
  const lambdaCost = lambdaComputeCost + lambdaRequestCost;

  // DynamoDB Cost
  const dynamoReadCost = readUnits * PRICING.DYNAMODB.READ_UNIT;
  const dynamoWriteCost = writeUnits * PRICING.DYNAMODB.WRITE_UNIT;
  const dynamoCost = dynamoReadCost + dynamoWriteCost;

  // API Gateway Cost
  const apiRequestCost = apiRequests * PRICING.API_GATEWAY.REQUEST;
  const apiCacheCost = cacheSizeGB * PRICING.API_GATEWAY.CACHE_GB_HOUR * 720; // 30 days
  const apiCost = apiRequestCost + apiCacheCost;

  return {
    lambda: {
      invocations,
      gbSeconds,
      cost: lambdaCost,
    },
    dynamodb: {
      readUnits,
      writeUnits,
      cost: dynamoCost,
    },
    apiGateway: {
      requests: apiRequests,
      cacheHours: 720,
      cost: apiCost,
    },
    total: lambdaCost + dynamoCost + apiCost,
  };
}

async function main() {
  // Mock data for now - in production this would fetch from CloudWatch
  const current = calculateCosts(
    100000, // invocations
    200, // avg duration
    1024, // memory
    500000, // read units
    50000, // write units
    120000, // api requests (includes cache hits)
    0.5, // cache size
  );

  const optimized = calculateCosts(
    60000, // invocations (-40%)
    150, // avg duration (-25%)
    512, // memory (tuned)
    400000, // read units (-20%)
    50000, // write units
    120000, // api requests
    0.5, // cache size
  );

  console.log('=== Cost Analysis (Monthly Estimate) ===');
  console.log('\nBaseline (Before Optimization):');
  console.log(`Lambda: $${current.lambda.cost.toFixed(2)}`);
  console.log(`DynamoDB: $${current.dynamodb.cost.toFixed(2)}`);
  console.log(`API Gateway: $${current.apiGateway.cost.toFixed(2)}`);
  console.log(`Total: $${current.total.toFixed(2)}`);

  console.log('\nOptimized (Projected):');
  console.log(`Lambda: $${optimized.lambda.cost.toFixed(2)}`);
  console.log(`DynamoDB: $${optimized.dynamodb.cost.toFixed(2)}`);
  console.log(`API Gateway: $${optimized.apiGateway.cost.toFixed(2)}`);
  console.log(`Total: $${optimized.total.toFixed(2)}`);

  const savings = current.total - optimized.total;
  const savingsPercent = (savings / current.total) * 100;

  console.log(`\nEstimated Savings: $${savings.toFixed(2)} (${savingsPercent.toFixed(1)}%)`);
}

main().catch(console.error);

#!/bin/bash
# Tail Lambda logs from CloudWatch

# Default values
STACK_NAME="react-stocks-backend"
FUNCTION_NAME="ReactStocksFunction"
TAIL_MODE="--tail"
FILTER=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --errors)
      FILTER="ERROR"
      echo "Filtering for errors only..."
      shift
      ;;
    --recent)
      TAIL_MODE=""
      echo "Showing recent logs (not tailing)..."
      shift
      ;;
    --stack)
      STACK_NAME="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: ./scripts/logs.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --errors          Show only error logs"
      echo "  --recent          Show recent logs (don't tail)"
      echo "  --stack NAME      Use custom stack name (default: react-stocks-backend)"
      echo "  --help, -h        Show this help message"
      echo ""
      echo "Examples:"
      echo "  ./scripts/logs.sh                  # Tail all logs"
      echo "  ./scripts/logs.sh --errors         # Tail error logs only"
      echo "  ./scripts/logs.sh --recent         # Show recent logs without tailing"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Run with --help for usage information"
      exit 1
      ;;
  esac
done

# Build sam logs command
CMD="sam logs -n $FUNCTION_NAME --stack-name $STACK_NAME $TAIL_MODE"

if [ -n "$FILTER" ]; then
  CMD="$CMD --filter $FILTER"
fi

echo "Running: $CMD"
echo "======================================"
echo ""

# Execute
eval $CMD

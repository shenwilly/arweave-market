async function main() {
  const subcourtID = "0";
  const noOfVotes = "3";
  console.log(
    `ArbitratorExtraData: 0x${
      parseInt(subcourtID, 10).toString(16).padStart(64, "0") +
      parseInt(noOfVotes, 10).toString(16).padStart(64, "0")
    }`
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

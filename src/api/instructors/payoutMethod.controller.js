const httpStatus = require('http-status').status;
const instructorService = require('./instructors.service'); // Vẫn gọi qua instructorService
const { catchAsync } = require('../../utils/catchAsync');

const getMyPayoutMethods = catchAsync(async (req, res) => {
  const methods = await instructorService.getMyPayoutMethods(req.user.id);

  res.status(httpStatus.OK).send({ payoutMethods: methods });
});

const addMyPayoutMethod = catchAsync(async (req, res) => {
  const methods = await instructorService.addMyPayoutMethod(
    req.user.id,
    req.body
  );
  res.status(httpStatus.CREATED).send({ payoutMethods: methods });
});

const updateMyPayoutMethod = catchAsync(async (req, res) => {
  const methods = await instructorService.updateMyPayoutMethod(
    req.user.id,
    req.params.payoutMethodId,
    req.body
  );
  res.status(httpStatus.OK).send({ payoutMethods: methods });
});

const setMyPrimaryPayoutMethod = catchAsync(async (req, res) => {
  const methods = await instructorService.setMyPrimaryPayoutMethod(
    req.user.id,
    req.params.payoutMethodId
  );
  res.status(httpStatus.OK).send(methods);
});

const deleteMyPayoutMethod = catchAsync(async (req, res) => {
  const methods = await instructorService.deleteMyPayoutMethod(
    req.user.id,
    req.params.payoutMethodId
  );
  res.status(httpStatus.OK).send({ payoutMethods: methods });
});

const updateMyPayoutMethodDetails = catchAsync(async (req, res) => {
  const methods = await instructorService.updateMyPayoutMethodDetails(
    req.user.id,
    req.params.payoutMethodId,
    req.body
  );
  res.status(httpStatus.OK).send({ payoutMethods: methods });
});

module.exports = {
  getMyPayoutMethods,
  addMyPayoutMethod,
  updateMyPayoutMethod,
  setMyPrimaryPayoutMethod,
  deleteMyPayoutMethod,
  updateMyPayoutMethodDetails,
};
